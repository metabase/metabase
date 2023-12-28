import type { ErrorType } from "./types";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class ValidationError extends Error {
  type?: ErrorType;

  constructor(message: string, errorType?: ErrorType) {
    super(message);
    this.type = errorType;
  }

  toString() {
    return `ValidationError: ${this.message} (type: ${this.type})`;
  }
}
