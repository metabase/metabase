import { ReactNode, useState } from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import Button from "metabase/core/components/Button";
import { Icon } from "metabase/core/components/Icon";
import Toggle from "metabase/core/components/Toggle";
import CopyWidget from "metabase/components/CopyWidget";
import Confirm from "metabase/components/Confirm";

import { getPublicEmbedHTML } from "metabase/public/lib/code";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  Description,
  EmbedWidgetHeader,
  Header,
  IconContainer,
  PublicEmbedHeader,
  PublicLinkHeader,
} from "./SharingPane.styled";

type Resource = {
  dashboard?: number;
  question?: number;
  public_uuid?: string;
};

type Extension = string | null;

interface SharingPaneProps {
  resource: Resource;
  resourceType: string;
  onCreatePublicLink: () => void;
  onDisablePublicLink: () => void;
  extensions: string[];
  getPublicUrl: (resource: Resource, extension?: Extension) => void;
  onChangeEmbedType: (embedType: string) => void;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  isApplicationEmbeddingEnabled: boolean;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function SharingPane({
  resource,
  resourceType,
  onCreatePublicLink,
  onDisablePublicLink,
  extensions = [],
  getPublicUrl,
  onChangeEmbedType,
  isAdmin,
  isPublicSharingEnabled,
  isApplicationEmbeddingEnabled,
}: SharingPaneProps) {
  const [extensionState, setExtension] = useState<Extension>(null);

  const publicLink = getPublicUrl(resource, extensionState);
  const iframeSource = getPublicEmbedHTML(getPublicUrl(resource));

  const shouldDisableEmbedding = !isAdmin || !isApplicationEmbeddingEnabled;

  const embeddingHelperText = getEmbeddingHelperText({
    isAdmin,
    isApplicationEmbeddingEnabled,
  });

  return (
    <div className="pt2 ml-auto mr-auto" style={{ maxWidth: 600 }}>
      {isAdmin && isPublicSharingEnabled && (
        <div className="px4 py3 mb4 bordered rounded flex align-center">
          <Header>{t`Enable sharing`}</Header>
          <div className="ml-auto">
            {resource.public_uuid ? (
              <Confirm
                title={t`Disable this public link?`}
                content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
                action={() => {
                  MetabaseAnalytics.trackStructEvent(
                    "Sharing Modal",
                    "Public Link Disabled",
                    resourceType,
                  );
                  onDisablePublicLink();
                }}
              >
                <Toggle value={true} />
              </Confirm>
            ) : (
              <Toggle
                value={false}
                onChange={() => {
                  MetabaseAnalytics.trackStructEvent(
                    "Sharing Modal",
                    "Public Link Enabled",
                    resourceType,
                  );
                  onCreatePublicLink();
                }}
              />
            )}
          </div>
        </div>
      )}

      <SharingOption
        className={cx("border-bottom", {
          disabled: !resource.public_uuid,
        })}
        illustration={
          <IconContainer>
            <Icon name="link" size={32} />
          </IconContainer>
        }
      >
        <PublicLinkHeader>{t`Public link`}</PublicLinkHeader>
        <Description className="mb1">{t`Share this ${resourceType} with people who don't have a Metabase account using the URL below:`}</Description>
        <CopyWidget value={publicLink} />
        {extensions && extensions.length > 0 && (
          <div className="mt1">
            {extensions.map(extension => (
              <span
                key={extension}
                className={cx(
                  "cursor-pointer text-brand-hover text-bold text-uppercase",
                  extension === extensionState ? "text-brand" : "text-light",
                )}
                onClick={() =>
                  setExtension(extensionState =>
                    extension === extensionState ? null : extension,
                  )
                }
              >
                {extension}{" "}
              </span>
            ))}
          </div>
        )}
      </SharingOption>

      <SharingOption
        className={cx("border-bottom", {
          disabled: !resource.public_uuid,
        })}
        illustration={
          <ResponsiveImage imageUrl="app/assets/img/simple_embed.png" />
        }
      >
        <PublicEmbedHeader>{t`Public embed`}</PublicEmbedHeader>
        <Description className="mb1">{t`Embed this ${resourceType} in blog posts or web pages by copying and pasting this snippet:`}</Description>
        <CopyWidget value={iframeSource} />
      </SharingOption>

      <SharingOption
        className={cx({
          disabled: shouldDisableEmbedding,
          "cursor-pointer": !shouldDisableEmbedding,
        })}
        illustration={
          <ResponsiveImage imageUrl="app/assets/img/secure_embed.png" />
        }
        onClick={() => {
          if (!shouldDisableEmbedding) {
            onChangeEmbedType("application");
          }
        }}
      >
        <EmbedWidgetHeader>{t`Embed in your application`}</EmbedWidgetHeader>
        <Description>{t`Add this ${resourceType} to your application server code. You’ll be able to preview the way it looks and behaves before making it securely visible for your users.`}</Description>
        {embeddingHelperText && (
          <Description enableMouseEvents>{embeddingHelperText}</Description>
        )}
        <Button primary>{t`Set up`}</Button>
      </SharingOption>
    </div>
  );
}

interface SharingOptionProps {
  className: string;
  onClick?: () => void;
  illustration: ReactNode;
  children: ReactNode;
}

function SharingOption({
  className,
  onClick,
  illustration,
  children,
}: SharingOptionProps) {
  return (
    <div
      className={cx("pt1 pb4 mb3 flex align-start", className)}
      onClick={onClick}
    >
      {illustration}
      <div className="ml2">{children}</div>
    </div>
  );
}

function ResponsiveImage({ imageUrl }: { imageUrl: string }) {
  return <img width={100} src={imageUrl} srcSet={getSrcSet(imageUrl)} />;
}

const imageRegExp = /(?<baseUrl>.*)(?<extension>\.[A-z]{3,4})/;
function getSrcSet(imageUrl: string) {
  const { baseUrl, extension } = imageRegExp.exec(imageUrl)?.groups as {
    baseUrl: string;
    extension: string;
  };

  return `${baseUrl}${extension} 1x, ${baseUrl}@2x${extension} 2x`;
}

function getEmbeddingHelperText({
  isAdmin,
  isApplicationEmbeddingEnabled,
}: {
  isAdmin: boolean;
  isApplicationEmbeddingEnabled: boolean;
}) {
  if (!isAdmin) {
    return t`Only Admins are able to embed questions. If you need access to this feature, reach out to them for permissions.`;
  }

  if (!isApplicationEmbeddingEnabled && isAdmin) {
    return jt`In order to embed your question, you have to first ${(
      <a
        className="link"
        href="/admin/settings/embedding-in-other-applications"
      >
        enable embedding in your Admin settings.
      </a>
    )}`;
  }

  return null;
}
