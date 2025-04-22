export const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};

type ErrorWithMessage = { message: string };

export const isErrorWithMessage = (
  value: unknown,
): value is ErrorWithMessage => {
  return isObject(value) && typeof value.message === "string";
};

type ErrorWithMessageResponse = { data: ErrorWithMessage };

export const isErrorWithMessageResponse = (
  value: unknown,
): value is ErrorWithMessageResponse =>
  isObject(value) && isErrorWithMessage(value.data);
