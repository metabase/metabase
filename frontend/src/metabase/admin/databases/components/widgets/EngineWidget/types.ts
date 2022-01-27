export interface EngineField {
  value?: string;
  onChange?: (value: string | undefined) => void;
}

export interface EngineOption {
  name: string;
  value: string;
  index: number;
}
