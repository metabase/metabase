import cx from "classnames";

import CS from "metabase/css/core/index.css";

import { PreviewPaneContainer } from "./PreviewPane.styled";

/**
 *
 * @param {object} props
 * @param {string=} props.className
 * @param {string} props.previewUrl
 * @param {boolean} props.isTransparent
 * @param {boolean} props.hidden
 * @returns
 */
// eslint-disable-next-line react/prop-types
export function PreviewPane({ className, previewUrl, isTransparent, hidden }) {
  return (
    <PreviewPaneContainer
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
