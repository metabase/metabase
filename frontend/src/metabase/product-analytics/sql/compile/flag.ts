const FLAG = /^[A-Za-z][A-Za-z0-9_]*$/;

/** A flag is a boolean/0-1 column on events_base. Reject anything that isn't a column name. */
export const flagSql = (flag: string): string => {
  if (!FLAG.test(flag)) {
    throw new Error(`Invalid flag column: ${flag}`);
  }
  return flag;
};
