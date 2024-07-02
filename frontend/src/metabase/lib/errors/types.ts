export type GenericErrorResponse = {
  data?:
    | {
        message?: string;
        errors?: Record<string, string>;
      }
    | string;
  errors?: Record<string, string>;
  message?: string;
};

export interface MaxLengthParams {
  max: number;
}

export interface LengthParams {
  length: number;
}
