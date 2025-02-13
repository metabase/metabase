import type { NotificationChannel } from "metabase-types/api";

import type { WebhookFormProps } from "./WebhookForm";

export const buildAuthInfo = (
  form: WebhookFormProps,
): Record<string, string> => {
  const { "fe-form-type": authType } = form;
  if (authType === "basic") {
    const { "auth-username": username, "auth-password": password } = form;
    return { Authorization: `Basic ${btoa(`${username}:${password}`)}` };
  } else if (authType === "bearer") {
    return { Authorization: `Bearer ${form["auth-info-value"]}` };
  } else if (authType === "api-key") {
    const { "auth-info-key": key, "auth-info-value": value } = form;
    if (key && value) {
      return { [key]: value };
    }
  }

  return {};
};

export const channelToForm = ({ details }: NotificationChannel) => {
  const { "fe-form-type": authType, "auth-info": authInfo } = details;

  if (authType === "bearer") {
    const token = authInfo?.["Authorization"];
    return { "auth-info-value": token?.match(/Bearer (.*)/)?.[1] || "" };
  }
  if (authType === "basic") {
    const info = authInfo?.["Authorization"];
    const encoded = info?.match(/Basic (.*)/)?.[1];

    if (encoded) {
      const decoded = atob(encoded);
      const [_, username, password] = decoded.match(/(.*):(.*)/) || [];

      if (username && password) {
        return {
          "auth-username": username,
          "auth-password": password,
        };
      }
    }
  }
  if (authType === "api-key" && authInfo) {
    const key = Object.keys(authInfo)[0];

    return { "auth-info-key": key, "auth-info-value": authInfo[key] };
  }
};
