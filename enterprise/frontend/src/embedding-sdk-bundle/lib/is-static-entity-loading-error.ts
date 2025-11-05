export const isStaticEntityLoadingError = (
  error: unknown,
): error is {
  status: number;
  data: string;
} => {
  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    "data" in error &&
    typeof error.data === "string"
  );
};
