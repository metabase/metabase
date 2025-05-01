import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Flex, Loader } from "metabase/ui";

import { PreviewPaneContainer } from "./PreviewPane.styled";

export type PreviewBackgroundType =
  | "no-background"
  | "checkerboard-light"
  | "checkerboard-dark";

type PreviewPaneProps = {
  className?: string;
  previewUrl: string | null;
  backgroundType: PreviewBackgroundType;
  hidden: boolean;
};

export function PreviewPane({
  className,
  previewUrl,
  backgroundType,
  hidden,
}: PreviewPaneProps) {
  return (
    <PreviewPaneContainer
      data-testid="preview-pane-container"
      hidden={hidden}
      backgroundType={backgroundType}
      className={cx(className, CS.flex, CS.relative)}
    >
      {!previewUrl && (
        <Flex justify="center" align="center" w="100%">
          <Loader size="lg" />
        </Flex>
      )}

      {previewUrl && (
        <iframe
          data-testid="embed-preview-iframe"
          className={CS.flexFull}
          src={previewUrl}
          frameBorder={0}
        />
      )}
    </PreviewPaneContainer>
  );
}
