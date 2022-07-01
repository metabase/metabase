export interface FontFile {
  src: string;
  fontWeight: number;
  fontFormat: FontFormat;
}

export interface FontFileOption {
  name: string;
  fontWeight: number;
}

export type FontFormat = "woff" | "woff2" | "truetype";
