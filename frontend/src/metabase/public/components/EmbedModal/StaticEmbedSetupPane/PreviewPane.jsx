import cx from "classnames";

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
      className={cx(className, "flex relative")}
    >
      <iframe
        data-testid="embed-preview-iframe"
        className="flex-full"
        src={previewUrl}
        frameBorder={0}
      />
    </PreviewPaneContainer>
  );
}
