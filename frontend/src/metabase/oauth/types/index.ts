type Context = "signin" | "signup" | "use";

type UxMode = "popup" | "redirect";

type ErrorCode =
  | "invalid_request"
  | "access_denied"
  | "unauthorized_client"
  | "unsupported_response_type"
  | "invalid_scope"
  | "server_error"
  | "temporarily_unavailable";

export interface IdConfiguration {
  /** Your application's client ID */
  client_id?: string;
  /** Enables automatic selection on Google One Tap */
  auto_select?: boolean;
  /** ID token callback handler */
  callback?: (credentialResponse: CredentialResponse) => void;
  /** The Sign In With Google button UX flow */
  ux_mode?: UxMode;
  /** The URL of your login endpoint */
  login_uri?: string;
  /** The URL of your password credential handler endpoint */
  native_login_uri?: string;
  /** The JavaScript password credential handler function name */
  native_callback?: (response: { id: string; password: string }) => void;
  /** Controls whether to cancel the prompt if the user clicks outside of the prompt */
  cancel_on_tap_outside?: boolean;
  /** The DOM ID of the One Tap prompt container element */
  prompt_parent_id?: string;
  /** A random string for ID tokens */
  nonce?: string;
  /** The title and words in the One Tap prompt */
  context?: Context;
  /** If you need to call One Tap in the parent domain and its subdomains, pass the parent domain to this attribute so that a single shared cookie is used. */
  state_cookie_domain?: string;
  /** The origins that are allowed to embed the intermediate iframe. One Tap will run in the intermediate iframe mode if this attribute presents */
  allowed_parent_origin?: string | string[];
  /**	Overrides the default intermediate iframe behavior when users manually close One Tap */
  intermediate_iframe_close_callback?: () => void;
  /** Enables upgraded One Tap UX on ITP browsers */
  itp_support?: boolean;
  /**
   * If your application knows the Workspace domain the user belongs to,
   * use this to provide a hint to Google. For more information,
   * see the [hd](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters)
   * field in the OpenID Connect docs.
   */
  hosted_domain?: string;
}

export interface CredentialResponse {
  /** This field is the returned ID token */
  credential?: string;
  /** This field sets how the credential is selected */
  select_by?:
    | "auto"
    | "user"
    | "user_1tap"
    | "user_2tap"
    | "btn"
    | "btn_confirm"
    | "brn_add_session"
    | "btn_confirm_add_session";
  clientId?: string;
}

export interface GoogleCredentialResponse extends CredentialResponse {
  client_id?: string;
}

export interface GsiButtonConfiguration {
  /** The button [type](https://developers.google.com/identity/gsi/web/reference/js-reference#type): icon, or standard button */
  type?: "standard" | "icon";
  /** The button [theme](https://developers.google.com/identity/gsi/web/reference/js-reference#theme). For example, filled_blue or filled_black */
  theme?: "outline" | "filled_blue" | "filled_black";
  /** The button [size](https://developers.google.com/identity/gsi/web/reference/js-reference#size). For example, small or large */
  size?: "large" | "medium" | "small";
  /** The button [text](https://developers.google.com/identity/gsi/web/reference/js-reference#text). For example, "Sign in with Google" or "Sign up with Google" */
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  /**	The button [shape](https://developers.google.com/identity/gsi/web/reference/js-reference#shape). For example, rectangular or circular */
  shape?: "rectangular" | "pill" | "circle" | "square";
  /**	The Google [logo alignment](https://developers.google.com/identity/gsi/web/reference/js-reference#logo_alignment): left or center */
  logo_alignment?: "left" | "center";
  /** The button [width](https://developers.google.com/identity/gsi/web/reference/js-reference#width), in pixels */
  width?: string;
  /** If set, then the button [language](https://developers.google.com/identity/gsi/web/reference/js-reference#locale) is rendered */
  locale?: string;
}

export interface PromptMomentNotification {
  /** Is this notification for a display moment? */
  isDisplayMoment: () => boolean;
  /** Is this notification for a display moment, and the UI is displayed? */
  isDisplayed: () => boolean;
  /** Is this notification for a display moment, and the UI isn't displayed? */
  isNotDisplayed: () => boolean;
  /** The detailed reason why the UI isn't displayed */
  getNotDisplayedReason: () =>
    | "browser_not_supported"
    | "invalid_client"
    | "missing_client_id"
    | "opt_out_or_no_session"
    | "secure_http_required"
    | "suppressed_by_user"
    | "unregistered_origin"
    | "unknown_reason";
  /** Is this notification for a skipped moment? */
  isSkippedMoment: () => boolean;
  /** The detailed reason for the skipped moment */
  getSkippedReason: () =>
    | "auto_cancel"
    | "user_cancel"
    | "tap_outside"
    | "issuing_failed";
  /** Is this notification for a dismissed moment? */
  isDismissedMoment: () => boolean;
  /** The detailed reason for the dismissa */
  getDismissedReason: () =>
    | "credential_returned"
    | "cancel_called"
    | "flow_restarted";
  /** Return a string for the moment type */
  getMomentType: () => "display" | "skipped" | "dismissed";
}

export interface TokenResponse {
  /** The access token of a successful token response. */
  access_token: string;

  /** The lifetime in seconds of the access token. */
  expires_in: number;

  /** The hosted domain the signed-in user belongs to. */
  hd?: string;

  /** The prompt value that was used from the possible list of values specified by TokenClientConfig or OverridableTokenClientConfig */
  prompt: string;

  /** The type of the token issued. */
  token_type: string;

  /** A space-delimited list of scopes that are approved by the user. */
  scope: string;

  /** The string value that your application uses to maintain state between your authorization request and the response. */
  state?: string;

  /** A single ASCII error code. */
  error?: ErrorCode;

  /**	Human-readable ASCII text providing additional information, used to assist the client developer in understanding the error that occurred. */
  error_description?: string;

  /** A URI identifying a human-readable web page with information about the error, used to provide the client developer with additional information about the error. */
  error_uri?: string;
}

export interface TokenClientConfig {
  /**
   *  The client ID for your application. You can find this value in the
   *  [API Console](https://console.cloud.google.com/apis/dashboard)
   */
  client_id: string;

  /**
   * A space-delimited list of scopes that identify the resources
   * that your application could access on the user's behalf.
   * These values inform the consent screen that Google displays to the user
   */
  scope: string;

  /**
   * Required for popup UX. The JavaScript function name that handles returned code response
   * The property will be ignored by the redirect UX
   */
  callback?: (response: TokenResponse) => void;

  /**
   * Optional, defaults to 'select_account'. A space-delimited, case-sensitive list of prompts to present the user
   */
  prompt?: "" | "none" | "consent" | "select_account";

  /**
   * 	Optional, defaults to true. If set to false,
   * [more granular Google Account permissions](https://developers.googleblog.com/2018/10/more-granular-google-account.html)
   * will be disabled for clients created before 2019. No effect for newer clients,
   * since more granular permissions is always enabled for them.
   */
  enable_serial_consent?: boolean;

  /**
   * Optional. If your application knows which user should authorize the request,
   * it can use this property to provide a hint to Google.
   * The email address for the target user. For more information,
   * see the [login_hint](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters) field in the OpenID Connect docs.
   */
  hint?: string;

  /**
   * Optional. If your application knows the Workspace domain the user belongs to,
   * use this to provide a hint to Google. For more information,
   * see the [hd](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters)
   * field in the OpenID Connect docs.
   */
  hosted_domain?: string;

  /**
   * Optional. Not recommended. Specifies any string value that
   * your application uses to maintain state between your authorization
   * request and the authorization server's response.
   */
  state?: string;
}

export interface OverridableTokenClientConfig {
  /**
   * Optional. A space-delimited, case-sensitive list of prompts to present the user.
   */
  prompt?: string;

  /**
   * Optional. If set to false,
   * [more granular Google Account permissions](https://developers.googleblog.com/2018/10/more-granular-google-account.html)
   * will be disabled for clients created before 2019.
   * No effect for newer clients, since more granular permissions is always enabled for them.
   */
  enable_serial_consent?: boolean;

  /**
   * Optional. If your application knows which user should authorize the request,
   * it can use this property to provide a hint to Google.
   *  The email address for the target user. For more information,
   * see the [login_hint](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters) field in the OpenID Connect docs.
   */
  hint?: string;

  /**
   * Optional. Not recommended. Specifies any string value that your
   * application uses to maintain state between your authorization request
   * and the authorization server's response.
   */
  state?: string;
}

export interface CodeResponse {
  /** The authorization code of a successful token response */
  code: string;
  /**	A space-delimited list of scopes that are approved by the user */
  scope: string;
  /**	The string value that your application uses to maintain state between your authorization request and the response */
  state?: string;
  /**	A single ASCII error code */
  error?: ErrorCode;
  /** Human-readable ASCII text providing additional information, used to assist the client developer in understanding the error that occurred */
  error_description?: string;
  /** A URI identifying a human-readable web page with information about the error, used to provide the client developer with additional information about the error */
  error_uri?: string;
}

export interface CodeClientConfig {
  /**
   * Required. The client ID for your application. You can find this value in the
   * [API Console](https://console.developers.google.com/)
   */
  client_id: string;

  /**
   * Required. A space-delimited list of scopes that identify
   * the resources that your application could access on the user's behalf.
   * These values inform the consent screen that Google displays to the user
   */
  scope: string;

  /**
   * Required for redirect UX. Determines where the API server redirects
   * the user after the user completes the authorization flow.
   * The value must exactly match one of the authorized redirect URIs for the OAuth 2.0 client,
   *  which you configured in the API Console and must conform to our
   * [Redirect URI validation](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation) rules. The property will be ignored by the popup UX
   */
  redirect_uri?: string;

  /**
   * Required for popup UX. The JavaScript function name that handles
   * returned code response. The property will be ignored by the redirect UX
   */
  callback?: (codeResponse: CodeResponse) => void;

  /**
   * Optional. Recommended for redirect UX. Specifies any string value that
   *  your application uses to maintain state between your authorization request and the authorization server's response
   */
  state?: string;

  /**
   * Optional, defaults to true. If set to false,
   * [more granular Google Account permissions](https://developers.googleblog.com/2018/10/more-granular-google-account.html)
   * will be disabled for clients created before 2019. No effect for newer clients, since
   * more granular permissions is always enabled for them
   */
  enable_serial_consent?: boolean;

  /**
   * Optional. If your application knows which user should authorize the request,
   * it can use this property to provide a hint to Google.
   * The email address for the target user. For more information,
   * see the [login_hint](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters) field in the OpenID Connect docs
   */
  hint?: string;

  /**
   * Optional. If your application knows the Workspace domain
   * the user belongs to, use this to provide a hint to Google.
   * For more information, see the [hd](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters) field in the OpenID Connect docs
   */
  hosted_domain?: string;

  /**
   * 	Optional. The UX mode to use for the authorization flow.
   * By default, it will open the consent flow in a popup. Valid values are popup and redirect
   */
  ux_mode?: "popup" | "redirect";

  /**
   * Optional, defaults to 'false'. Boolean value to prompt the user to select an account
   */
  select_account?: boolean;
}

export type MomenListener = (
  promptMomentNotification: PromptMomentNotification,
) => void;
