import type { CSSProperties, ReactNode, PropsWithChildren } from "react";

export type LoadingAndErrorWrapperProps = PropsWithChildren<
  Partial<{
    className: string;
    style: CSSProperties;

    // display config
    noBackground: boolean;
    noWrapper: boolean;
    showSpinner: boolean;

    "data-testid": string;

    loading: boolean;
    loadingMessages?: string[];
    messageInterval?: number;
    loadingScenes: ReactNode[];

    error: unknown | Error | null;
    renderError: (errorMessage: ReactNode | string) => ReactNode;
  }>
>;

export type ErrorDataMessage = {
  message?: string;
};

export type ErrorWithData = {
  data?: ErrorDataMessage | string;
  statusText?: string;
  message?: string;
};

export type Error = ErrorWithData | string;
