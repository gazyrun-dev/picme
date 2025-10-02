
export type GeneratedImageStatus = 'pending' | 'success' | 'failed';

export interface GeneratedImage {
  id: string;
  status: GeneratedImageStatus;
  imageUrl: string | null;
}

export type TemplateName = 'decades' | 'styleLookbook' | 'eightiesMall' | 'figurines' | 'hairStyler' | 'impossibleSelfies' | 'headshots';

export interface Prompt {
  id: string;
  base: string;
}

export interface BaseTemplate {
    name: string;
    description: string;
    icon: string;
    isPolaroid: boolean;
    prompts: Prompt[];
}

export interface StyleLookbookTemplate extends BaseTemplate {
    styles: string[];
    moods: string[];
}

export type Template = BaseTemplate | StyleLookbookTemplate;

export interface Templates {
    decades: BaseTemplate;
    styleLookbook: StyleLookbookTemplate;
    eightiesMall: BaseTemplate;
    figurines: BaseTemplate;
    hairStyler: BaseTemplate;
    impossibleSelfies: BaseTemplate;
    headshots: BaseTemplate;
}

export interface ModelInstructionOptions {
    headshotExpression: string;
    headshotPose: string;
    currentAlbumStyle: string;
    lookbookStyle: string;
    customLookbookStyle: string;
    hairColors: string[];
    moodStyles: string[];
}
