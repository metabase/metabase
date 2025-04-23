export const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};

type ErrorWithMessage = {
  message: string;
};

export const isErrorWithMessage = (
  value: unknown,
): value is ErrorWithMessage => {
  return isObject(value) && typeof value.message === "string";
};

type ErrorWithMessageResponse = {
  data: ErrorWithMessage;
};

export const isErrorWithMessageResponse = (
  value: unknown,
): value is ErrorWithMessageResponse =>
  isObject(value) && isErrorWithMessage(value.data);

type FormErrors = {
  errors: Record<string, string>;
  "specific-errors": Record<string, Record<string, string>>;
};

type FormErrorResponse = {
  data: FormErrors;
};

export const isFormErrorResponse = (
  value: unknown,
): value is FormErrorResponse =>
  isObject(value) &&
  isObject(value.data) &&
  isObject(value.data.errors) &&
  isObject(value.data["specific-errors"]);
