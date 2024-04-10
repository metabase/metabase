import cx from "classnames";

import CS from "metabase/css/core/index.css";

import { PreviewPaneContainer } from "./PreviewPane.styled";

type PreviewPaneProps = {
  className?: string;
  previewUrl: string;
  isTransparent: boolean;
  hidden: boolean;
};

export function PreviewPane({
  className,
  previewUrl,
  isTransparent,
  hidden,
}: PreviewPaneProps) {
  return (
    <PreviewPaneContainer
      data-testid="preview-pane-container"
      hidden={hidden}
      isTransparent={isTransparent}
      className={cx(className, CS.flex, CS.relative)}
    >
      <iframe
        data-testid="embed-preview-iframe"
        className={CS.flexFull}
        src={previewUrl}
        frameBorder={0}
      />
    </PreviewPaneContainer>
  );
}
