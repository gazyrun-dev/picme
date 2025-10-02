
import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GeneratedImage, TemplateName, Prompt, StyleLookbookTemplate } from './types';
import { TEMPLATES } from './constants';
import { toBase64, createSingleFramedImage, createAlbumImage } from './services/imageService';
import { generateImage, generateDynamicPrompt, getModelInstruction } from './services/geminiService';

import { IconCamera, IconSparkles, IconUpload, IconX, IconPlus } from './components/Icons';
import { Button } from './components/Button';
import { PhotoDisplay } from './components/PhotoDisplay';
import { LoadingCard } from './components/LoadingCard';
import { ErrorCard } from './components/ErrorCard';
import { CameraModal } from './components/CameraModal';
import { TemplateCard } from './components/TemplateCard';
import { RadioPill } from './components/RadioPill';
import { ErrorNotification } from './components/ErrorNotification';
import { AlbumDownloadButton } from './components/AlbumDownloadButton';

const App: React.FC = () => {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [isDownloadingAlbum, setIsDownloadingAlbum] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const resultsRef = useRef<HTMLDivElement>(null);

    const [template, setTemplate] = useState<TemplateName | null>(null);
    const [currentAlbumStyle, setCurrentAlbumStyle] = useState('');

    const [hairColors, setHairColors] = useState<string[]>([]);
    const [selectedHairStyles, setSelectedHairStyles] = useState<string[]>([]);
    const [customHairStyle, setCustomHairStyle] = useState('');
    const [isCustomHairActive, setIsCustomHairActive] = useState(false);

    const [lookbookStyle, setLookbookStyle] = useState('');
    const [customLookbookStyle, setCustomLookbookStyle] = useState('');
    const [moodStyles, setMoodStyles] = useState<string[]>([]);

    const [headshotExpression, setHeadshotExpression] = useState('Friendly Smile');
    const [headshotPose, setHeadshotPose] = useState('Forward');

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsUploading(true);
            setError(null);
            try {
                const base64Image = await toBase64(file);
                setUploadedImage(base64Image);
                setGeneratedImages([]);
            } catch (err) {
                console.error("Error during image upload:", err);
                setError("That image couldn't be processed. Please try another file.");
            } finally {
                setIsUploading(false);
                 if (fileInputRef.current) fileInputRef.current.value = "";
            }
        }
    };

    const handleCaptureConfirm = (imageDataUrl: string) => {
        setUploadedImage(imageDataUrl);
        setGeneratedImages([]);
        setError(null);
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return setError("Please upload a photo to get started!");
        if (!template) return setError("Please select a theme!");

        if (template === 'styleLookbook' && (!lookbookStyle || (lookbookStyle === 'Other' && !customLookbookStyle.trim()))) {
            return setError("Please choose or enter a fashion style for your lookbook!");
        }
        if (template === 'hairStyler' && selectedHairStyles.length === 0 && (!isCustomHairActive || !customHairStyle.trim())) {
            return setError("Please select at least one hairstyle to generate!");
        }
        if (template === 'hairStyler' && isCustomHairActive && !customHairStyle.trim()) {
            return setError("Please enter your custom hairstyle or deselect 'Other...'");
        }

        setIsLoading(true);
        setError(null);
        setGeneratedImages([]);

        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        const imageWithoutPrefix = uploadedImage.split(',')[1];
        const activeTemplate = TEMPLATES[template];

        let dynamicStyleForAlbum = '';
        if (template === 'eightiesMall') {
            setIsSettingUp(true);
            try {
                dynamicStyleForAlbum = await generateDynamicPrompt("A specific, creative, and detailed style for an 80s mall portrait studio photoshoot.");
                setCurrentAlbumStyle(dynamicStyleForAlbum);
            } catch (e) {
                setError("We couldn't generate a photoshoot style. Please try again.");
                setIsLoading(false);
                setIsSettingUp(false);
                return;
            }
            setIsSettingUp(false);
        } else {
            setCurrentAlbumStyle('');
        }
        
        const promptsForGeneration = template === 'hairStyler'
            ? [...activeTemplate.prompts.filter(p => selectedHairStyles.includes(p.id)), ...(isCustomHairActive && customHairStyle.trim() ? [{ id: customHairStyle, base: customHairStyle }] : [])]
            : activeTemplate.prompts;

        if (!promptsForGeneration || promptsForGeneration.length === 0) {
            setError("There was an issue preparing the creative ideas. Please try again.");
            setIsLoading(false);
            return;
        }

        setGeneratedImages(promptsForGeneration.map(p => ({ id: p.id, status: 'pending', imageUrl: null })));
        
        for (let i = 0; i < promptsForGeneration.length; i++) {
            const p = promptsForGeneration[i];
            try {
                const modelInstruction = getModelInstruction(template, p, {
                    headshotExpression, headshotPose,
                    currentAlbumStyle: dynamicStyleForAlbum,
                    lookbookStyle, customLookbookStyle,
                    hairColors,
                    moodStyles,
                });

                const imageUrl = await generateImage(modelInstruction, imageWithoutPrefix);

                setGeneratedImages(prev => prev.map((img, index) =>
                    index === i ? { ...img, status: 'success', imageUrl } : img
                ));
            } catch (err) {
                console.error(`Failed to generate image for ${p.id}:`, err);
                setGeneratedImages(prev => prev.map((img, index) =>
                    index === i ? { ...img, status: 'failed' } : img
                ));
            }
        }
        setIsLoading(false);
    };
    
    const regenerateImageAtIndex = useCallback(async (imageIndex: number) => {
        const imageToRegenerate = generatedImages[imageIndex];
        if (!imageToRegenerate || !template || !uploadedImage) return;

        setGeneratedImages(prev => prev.map((img, index) =>
            index === imageIndex ? { ...img, status: 'pending' } : img
        ));
        setError(null);

        const activeTemplate = TEMPLATES[template];
        const promptsForGeneration = template === 'hairStyler'
            ? [...activeTemplate.prompts.filter(p => selectedHairStyles.includes(p.id)), ...(isCustomHairActive && customHairStyle.trim() ? [{ id: customHairStyle, base: customHairStyle }] : [])]
            : activeTemplate.prompts;

        const prompt = promptsForGeneration[imageIndex];
        if (!prompt) {
            setError("Could not find the prompt to regenerate.");
            setGeneratedImages(prev => prev.map((img, index) => index === imageIndex ? { ...img, status: 'failed' } : img));
            return;
        }

        try {
            if (template === 'eightiesMall' && !currentAlbumStyle) throw new Error("Cannot regenerate without an album style. Please start over.");
            
            const imageWithoutPrefix = uploadedImage.split(',')[1];
            const modelInstruction = getModelInstruction(template, prompt, { headshotExpression, headshotPose, currentAlbumStyle, lookbookStyle, customLookbookStyle, hairColors, moodStyles });
            
            const imageUrl = await generateImage(modelInstruction, imageWithoutPrefix);

            setGeneratedImages(prev => prev.map((img, index) =>
                index === imageIndex ? { ...img, status: 'success', imageUrl } : img
            ));
        } catch (err) {
            console.error(`Regeneration failed for ${prompt.id}:`, err);
            setError(`Oops! Regeneration for "${prompt.id}" failed. Please try again.`);
            setGeneratedImages(prev => prev.map((img, index) =>
                index === imageIndex ? { ...img, status: 'failed' } : img
            ));
        }
    }, [generatedImages, template, uploadedImage, currentAlbumStyle, headshotExpression, headshotPose, lookbookStyle, customLookbookStyle, hairColors, selectedHairStyles, isCustomHairActive, customHairStyle, moodStyles]);


    const triggerDownload = async (href: string, fileName: string) => {
        try {
            const response = await fetch(href);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        } catch (error) {
            console.error("Could not download the image:", error);
            setError("Sorry, the download failed. Please try again.");
        }
    };
    
    const handleDownloadRequest = async (imageUrl: string, era: string, ratio: '1:1' | '9:16') => {
        const fileName = `picture-me-${era.toLowerCase().replace(/\s+/g, '-')}-${ratio.replace(':', 'x')}.png`;
        try {
            const shouldAddLabel = template && !['headshots', 'eightiesMall', 'styleLookbook', 'figurines'].includes(template);
            const framedImageUrl = await createSingleFramedImage(imageUrl, ratio, shouldAddLabel ? era : null);
            await triggerDownload(framedImageUrl, fileName);
        } catch (err) {
            console.error(`Failed to create framed image for download:`, err);
            setError(`Could not prepare that image for download. Please try again.`);
        }
    };

    const handleAlbumDownloadRequest = async (ratio: '1:1' | '9:16') => {
        if (isDownloadingAlbum || !template) return;
        setIsDownloadingAlbum(true);
        setError(null);

        try {
            const successfulImages = generatedImages.filter(img => img.status === 'success');
            if (successfulImages.length === 0) {
                setError("There are no successful images to include in an album.");
                setIsDownloadingAlbum(false);
                return;
            }

            let albumTitle = "My PictureMe Album";
            if (template) albumTitle = TEMPLATES[template].name;

            const shouldAddLabel = !['headshots', 'eightiesMall', 'styleLookbook', 'figurines'].includes(template);
            
            const albumDataUrl = await createAlbumImage(successfulImages, ratio, albumTitle, shouldAddLabel);

            await triggerDownload(albumDataUrl, `picture-me-album-${ratio.replace(':', 'x')}.png`);

        } catch (err) {
            console.error("Failed to create or download album:", err);
            setError("Sorry, the album download failed. Please try again.");
        } finally {
            setIsDownloadingAlbum(false);
        }
    };

    const handleTemplateSelect = (templateId: TemplateName | null) => {
        setTemplate(templateId);
        setHeadshotExpression('Friendly Smile');
        setHeadshotPose('Forward');
        setLookbookStyle('');
        setCustomLookbookStyle('');
        setHairColors([]);
        setSelectedHairStyles([]);
        setCustomHairStyle('');
        setIsCustomHairActive(false);
        setMoodStyles([]);
    };

    const handleStartOver = () => {
        setGeneratedImages([]);
        setUploadedImage(null);
        setError(null);
        handleTemplateSelect(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const progress = generatedImages.length > 0
        ? (generatedImages.filter(img => img.status !== 'pending').length / generatedImages.length) * 100
        : 0;

    const totalSelectedStyles = selectedHairStyles.length + (isCustomHairActive ? 1 : 0);

    const handleHairStyleSelect = (styleId: string) => {
        if (styleId === 'Other') {
            setIsCustomHairActive(prev => {
                const isActivating = !prev;
                if (isActivating && selectedHairStyles.length >= 8) {
                    setError("You can select a maximum of 8 styles.");
                    return prev;
                }
                if (!isActivating) setCustomHairStyle('');
                return isActivating;
            });
            return;
        }

        setSelectedHairStyles(prev => {
            const isSelected = prev.includes(styleId);
            const totalSelected = prev.length + (isCustomHairActive ? 1 : 0);
            
            if (isSelected) return prev.filter(s => s !== styleId);
            
            if (totalSelected < 8) return [...prev, styleId];
            
            setError("You can select a maximum of 8 styles.");
            return prev;
        });
    };

    const handleMoodStyleSelect = (style: string) => {
        setMoodStyles(prev => {
            if (prev.includes(style)) {
                return prev.filter(s => s !== style);
            }
            return [...prev, style];
        });
    };
    
    return (
        <>
            <CameraModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCaptureConfirm} />
            <div className="bg-black text-gray-200 min-h-screen flex flex-col items-center p-4 pb-20">
                <ErrorNotification message={error} onDismiss={() => setError(null)} />
                <div className="w-full max-w-6xl mx-auto">
                    <header className="text-center my-12">
                        <h1 className="text-6xl md:text-7xl font-caveat text-white tracking-tight">Picture<span className="text-yellow-400">Me</span></h1>
                        <p className="mt-4 text-lg text-gray-500">Transform your photos with the power of Gemini.</p>
                    </header>
                    <main>
                        <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-gray-800 mb-16">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div>
                                    <h2 className="text-2xl font-semibold mb-6 text-white">1. Your Photo</h2>
                                    <div className="w-full aspect-square border-4 border-dashed border-gray-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-yellow-400 transition-colors bg-gray-800 overflow-hidden shadow-inner" onClick={() => !uploadedImage && fileInputRef.current?.click()}>
                                        {isUploading ? (<div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-yellow-400"></div>) 
                                        : uploadedImage ? (<img src={uploadedImage} alt="Uploaded preview" className="w-full h-full object-cover" />) 
                                        : (
                                            <div className="flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                                <IconUpload />
                                                <p className="mt-4 text-lg text-gray-300">Click to upload a file</p>
                                                <p className="mt-4 text-sm">or</p>
                                                <Button onClick={(e) => { e.stopPropagation(); setIsCameraOpen(true); }} className="mt-2"><IconCamera /> <span className="ml-2">Use Camera</span></Button>
                                            </div>
                                        )}
                                    </div>
                                    {uploadedImage && !isUploading && (
                                        <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full">
                                            <Button onClick={() => fileInputRef.current?.click()} className="flex-1">Change File</Button>
                                            <Button onClick={() => setIsCameraOpen(true)} className="flex-1"><IconCamera /><span className="ml-2">Use Camera</span></Button>
                                        </div>
                                    )}
                                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/png, image/jpeg" className="hidden" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-semibold mb-6 text-white">2. Choose a Theme</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                                        {(Object.keys(TEMPLATES) as TemplateName[]).map(key => {
                                            const data = TEMPLATES[key];
                                            return <TemplateCard key={key} id={key} name={data.name} icon={data.icon} description={data.description} isSelected={template === key} onSelect={handleTemplateSelect} />
                                        })}
                                    </div>
                                    
                                    {template === 'hairStyler' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-6 border border-gray-700 rounded-xl space-y-6 bg-gray-800/50">
                                            <div className="flex justify-between items-center"><h3 className='text-xl font-semibold text-white'>Customize Hairstyle</h3><span className={`text-sm font-bold ${totalSelectedStyles >= 8 ? 'text-yellow-400' : 'text-gray-500'}`}>{totalSelectedStyles} / 8</span></div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-3">Style (select up to 8)</label>
                                                <div className="flex flex-wrap gap-3">
                                                    {TEMPLATES.hairStyler.prompts.map(prompt => (<button key={prompt.id} onClick={() => handleHairStyleSelect(prompt.id)} className={`cursor-pointer px-3 py-1.5 text-sm rounded-full transition-colors font-semibold ${selectedHairStyles.includes(prompt.id) ? 'bg-yellow-400 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>{prompt.id}</button>))}
                                                    <button onClick={() => handleHairStyleSelect('Other')} className={`cursor-pointer px-3 py-1.5 text-sm rounded-full transition-colors font-semibold ${isCustomHairActive ? 'bg-yellow-400 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>Other...</button>
                                                </div>
                                            </div>
                                            {isCustomHairActive && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><label className="block text-sm font-medium text-gray-400 mb-2">Your Custom Style</label><input type="text" placeholder="e.g., A vibrant pink mohawk" value={customHairStyle} onChange={(e) => setCustomHairStyle(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 text-white" /></motion.div>)}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-3">Hair Color</label>
                                                <div className="flex items-center gap-4 flex-wrap">
                                                    {hairColors.map((color, index) => (<motion.div key={index} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 p-2 bg-gray-700/50 rounded-lg border border-gray-600"><div className="relative w-10 h-10 rounded-md overflow-hidden" style={{ backgroundColor: color }}><input type="color" value={color} onChange={(e) => setHairColors(p => { const n = [...p]; n[index] = e.target.value; return n; })} className="absolute inset-0 w-full h-full cursor-pointer opacity-0" /></div><span className="font-mono text-sm text-gray-300 uppercase">{color}</span><button onClick={() => setHairColors(p => p.filter((_, i) => i !== index))} className="p-1 rounded-full text-gray-500 hover:bg-gray-600 hover:text-red-400 transition-colors" aria-label="Remove color"><IconX /></button></motion.div>))}
                                                    {hairColors.length < 2 && (<button onClick={() => setHairColors(p => [...p, '#4a2c20'])} className="flex items-center justify-center gap-2 h-[68px] px-4 rounded-lg border-2 border-dashed border-gray-600 hover:border-yellow-400 text-gray-400 hover:text-yellow-400 transition-colors bg-gray-700/30"><IconPlus /><span>{hairColors.length === 0 ? 'Add Color' : 'Add Highlight'}</span></button>)}
                                                </div>
                                                {hairColors.length > 0 && (<button onClick={() => setHairColors([])} className="text-xs text-gray-500 hover:text-white transition-colors mt-3">Clear all colors</button>)}
                                            </div>
                                        </motion.div>
                                    )}
                                    {template === 'headshots' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-6 border border-gray-700 rounded-xl space-y-6 bg-gray-800/50">
                                            <h3 className='text-xl font-semibold text-white'>Customize Headshot</h3>
                                            <div><label className="block text-sm font-medium text-gray-400 mb-3">Facial Expression</label><div className="flex flex-wrap gap-3"><RadioPill name="expression" value="Friendly Smile" label="Friendly Smile" checked={headshotExpression === 'Friendly Smile'} onChange={e => setHeadshotExpression(e.target.value)} /><RadioPill name="expression" value="Confident Look" label="Confident Look" checked={headshotExpression === 'Confident Look'} onChange={e => setHeadshotExpression(e.target.value)} /><RadioPill name="expression" value="Thoughtful Gaze" label="Thoughtful Gaze" checked={headshotExpression === 'Thoughtful Gaze'} onChange={e => setHeadshotExpression(e.target.value)} /></div></div>
                                            <div><label className="block text-sm font-medium text-gray-400 mb-3">Pose</label><div className="flex flex-wrap gap-3"><RadioPill name="pose" value="Forward" label="Facing Forward" checked={headshotPose === 'Forward'} onChange={e => setHeadshotPose(e.target.value)} /><RadioPill name="pose" value="Angle" label="Slight Angle" checked={headshotPose === 'Angle'} onChange={e => setHeadshotPose(e.target.value)} /></div></div>
                                        </motion.div>
                                    )}
                                    {template === 'styleLookbook' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-6 border border-gray-700 rounded-xl space-y-8 bg-gray-800/50">
                                            <div>
                                                <h3 className='text-xl font-semibold text-white'>Choose a Fashion Style</h3>
                                                <div className="mt-4"><div className="flex flex-wrap gap-3">{(TEMPLATES.styleLookbook as StyleLookbookTemplate).styles.map(style => (<RadioPill key={style} name="style" value={style} label={style} checked={lookbookStyle === style} onChange={e => { setLookbookStyle(e.target.value); setCustomLookbookStyle(''); }} />))}<RadioPill name="style" value="Other" label="Other..." checked={lookbookStyle === 'Other'} onChange={e => setLookbookStyle(e.target.value)} /></div></div>
                                                {lookbookStyle === 'Other' && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4"><label className="block text-sm font-medium text-gray-400 mb-2">Your Custom Style</label><input type="text" placeholder="e.g., Cyberpunk, Avant-garde" value={customLookbookStyle} onChange={(e) => setCustomLookbookStyle(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 text-white" /></motion.div>)}
                                            </div>
                                            <div>
                                                <h3 className='text-xl font-semibold text-white'>Change mood style</h3>
                                                <p className="text-sm text-gray-400 mt-1 mb-3">Optional: Select photographic styles to apply.</p>
                                                <div className="flex flex-wrap gap-3">
                                                    {(TEMPLATES.styleLookbook as StyleLookbookTemplate).moods.map(mood => (
                                                        <button 
                                                            key={mood} 
                                                            onClick={() => handleMoodStyleSelect(mood)} 
                                                            className={`cursor-pointer px-3 py-1.5 text-sm rounded-full transition-colors font-semibold ${moodStyles.includes(mood) ? 'bg-yellow-400 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                                                        >
                                                            {mood}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-12 text-center">
                                <Button onClick={handleGenerateClick} disabled={!uploadedImage || !template || isLoading || isUploading || isSettingUp} primary className="text-lg px-12 py-4">
                                    <div className="flex items-center gap-3">
                                        {isLoading || isSettingUp ? (<><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-black"></div>{isSettingUp ? "Setting the stage..." : `Generating... (${Math.round(progress)}%)`}</>) : (<><IconSparkles />Generate Photos</>)}
                                    </div>
                                </Button>
                            </div>
                        </div>
                        <div ref={resultsRef}>
                            {isSettingUp && (
                                <div className="text-center my-20 flex flex-col items-center p-10 bg-gray-900/70 rounded-2xl"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-pink-500 mb-6"></div><p className="text-2xl text-pink-400 font-semibold tracking-wider italic">Teasing our hair and firing up the lasers...</p><p className="text-gray-400 mt-2">Generating a totally tubular '80s photoshoot style!</p></div>
                            )}
                            {(isLoading || generatedImages.length > 0) && !isSettingUp && (
                                <div className="mt-16">
                                    <h2 className="text-3xl font-bold text-white mb-8 text-center">Your Generated Photos</h2>
                                    {isLoading && (
                                        <div className="w-full max-w-4xl mx-auto mb-8 text-center"><div className="bg-gray-800 rounded-full h-3 overflow-hidden shadow-md"><motion.div className="bg-yellow-400 h-3 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div><p className="text-gray-400 mt-4 text-sm">Please keep this window open while your photos are being generated.</p></div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 mt-8">
                                        {generatedImages.map((img, index) => {
                                            if (!template) return null;
                                            const activeTemplate = TEMPLATES[template];
                                            const isPolaroid = activeTemplate.isPolaroid;
                                            const showLabel = !['headshots', 'eightiesMall', 'styleLookbook', 'figurines'].includes(template);
                                            switch (img.status) {
                                                case 'success': return <PhotoDisplay key={`${img.id}-${index}-success`} era={img.id} imageUrl={img.imageUrl!} onDownload={handleDownloadRequest} onRegenerate={() => regenerateImageAtIndex(index)} isPolaroid={isPolaroid} index={index} showLabel={showLabel} />;
                                                case 'failed': return <ErrorCard key={`${img.id}-${index}-failed`} isPolaroid={isPolaroid} onRegenerate={() => regenerateImageAtIndex(index)} showLabel={showLabel} />;
                                                default: return <LoadingCard key={`${img.id}-${index}-pending`} isPolaroid={isPolaroid} showLabel={showLabel} />;
                                            }
                                        })}
                                    </div>
                                    <p className="text-center text-xs text-gray-600 mt-8">Made with Gemini</p>
                                </div>
                            )}
                            {!isLoading && generatedImages.length > 0 && (
                                <div className="text-center mt-16 mb-12 flex justify-center gap-6">
                                    <Button onClick={handleStartOver}>Start Over</Button>
                                    <AlbumDownloadButton isDownloading={isDownloadingAlbum} onDownloadRequest={handleAlbumDownloadRequest} />
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default App;
