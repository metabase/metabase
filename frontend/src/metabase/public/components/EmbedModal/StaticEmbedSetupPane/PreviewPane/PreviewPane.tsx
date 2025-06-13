import cx from "classnames";
import { match } from "ts-pattern";

import CS from "metabase/css/core/index.css";

import Style from "./PreviewPane.module.css";
import { getCheckerBoardDataUri } from "./utils";

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

interface PreviewPaneContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hidden?: boolean;
  backgroundType: PreviewBackgroundType;
  className?: string;
}

function PreviewPaneContainer({
  children,
  hidden,
  backgroundType,
  className,
  ...divProps
}: PreviewPaneContainerProps) {
  const dataUri = match(backgroundType)
    .returnType<string | null>()
    .with("checkerboard-light", () => {
      return getCheckerBoardDataUri("checkerboard-light");
    })
    .with("checkerboard-dark", () => {
      return getCheckerBoardDataUri("checkerboard-dark");
    })
    .with("no-background", () => null)
    .exhaustive();

  return (
    <div
      className={cx(Style.Container, className)}
      style={{
        ["--background-url" as any]: `url(${dataUri})`,
        display: hidden ? "none" : undefined,
      }}
      {...divProps}
    >
      {children}
    </div>
  );
}
