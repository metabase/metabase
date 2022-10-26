import { ErrorType } from "./types";

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
