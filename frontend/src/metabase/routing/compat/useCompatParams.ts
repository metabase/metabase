import { useParams as useParamsV7 } from "react-router-dom";

export function useCompatParams<
  T extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
>(): T {
  return useParamsV7() as T;
}
