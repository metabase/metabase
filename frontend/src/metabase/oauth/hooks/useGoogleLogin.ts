/* eslint-disable */
import { useCallback, useEffect, useRef } from "react";

import { useGoogleOAuth } from "../GoogleOAuthProvider";
import {
  TokenClientConfig,
  TokenResponse,
  CodeClientConfig,
  CodeResponse,
  OverridableTokenClientConfig,
} from "../types";

interface ImplicitFlowOptions
  extends Omit<TokenClientConfig, "client_id" | "scope" | "callback"> {
  onSuccess?: (
    tokenResponse: Omit<
      TokenResponse,
      "error" | "error_description" | "error_uri"
    >,
  ) => void;
  onError?: (
    errorResponse: Pick<
      TokenResponse,
      "error" | "error_description" | "error_uri"
    >,
  ) => void;
  scope?: TokenClientConfig["scope"];
}

interface AuthCodeFlowOptions
  extends Omit<CodeClientConfig, "client_id" | "scope" | "callback"> {
  onSuccess?: (
    codeResponse: Omit<
      CodeResponse,
      "error" | "error_description" | "error_uri"
    >,
  ) => void;
  onError?: (
    errorResponse: Pick<
      CodeResponse,
      "error" | "error_description" | "error_uri"
    >,
  ) => void;
  scope?: CodeResponse["scope"];
}

export type UseGoogleLoginOptionsImplicitFlow = {
  flow?: "implicit";
} & ImplicitFlowOptions;

export type UseGoogleLoginOptionsAuthCodeFlow = {
  flow?: "auth-code";
} & AuthCodeFlowOptions;

export type UseGoogleLoginOptions =
  | UseGoogleLoginOptionsImplicitFlow
  | UseGoogleLoginOptionsAuthCodeFlow;

export default function useGoogleLogin(
  options: UseGoogleLoginOptionsImplicitFlow,
): (overrideConfig?: OverridableTokenClientConfig) => void;
export default function useGoogleLogin(
  options: UseGoogleLoginOptionsAuthCodeFlow,
): () => void;

export default function useGoogleLogin({
  flow = "implicit",
  scope = "",
  onSuccess,
  onError,
  ...props
}: UseGoogleLoginOptions): unknown {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const clientRef = useRef<any>();

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!scriptLoadedSuccessfully) return;

    const clientMethod =
      flow === "implicit" ? "initTokenClient" : "initCodeClient";

    const client = window.google?.accounts.oauth2[clientMethod]({
      client_id: clientId,
      scope: `openid profile email ${scope}`,
      callback: (response: TokenResponse | CodeResponse) => {
        if (response.error) return onErrorRef.current?.(response);

        onSuccessRef.current?.(response as any);
      },
      ...props,
    });

    clientRef.current = client;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, scriptLoadedSuccessfully, flow, scope]);

  const loginImplicitFlow = useCallback(
    (overrideConfig?: OverridableTokenClientConfig) =>
      clientRef.current.requestAccessToken(overrideConfig),
    [],
  );

  const loginAuthCodeFlow = useCallback(
    () => clientRef.current.requestCode(),
    [],
  );

  return flow === "implicit" ? loginImplicitFlow : loginAuthCodeFlow;
}
