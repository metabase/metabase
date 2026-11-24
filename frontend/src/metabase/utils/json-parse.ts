/* eslint-disable @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
export const safeJsonParse = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    console.error("Unable to parse JSON: ", value, e);
    return null;
  }
};
