import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { ChartTypeDropdown } from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import { ToolbarButton } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/ToolbarButton";
import ToolbarButtonS from "embedding-sdk-bundle/components/private/SdkQuestion/styles/ToolbarButton.module.css";
import { Box } from "metabase/ui";

import MobileToolbarS from "./MobileToolbar.module.css";

type Props = {
  isEditorOpen: boolean;
  toggleEditor?: () => void;
  withChartTypeSelector: boolean | undefined;
  rightButton?: ({ className }: { className: string }) => ReactNode;
  "data-testid"?: string;
};

export const MobileToolbar = ({
  isEditorOpen,
  toggleEditor,
  withChartTypeSelector,
  rightButton,
  "data-testid": dataTestId,
}: Props) => (
  <Box className={MobileToolbarS.MobileToolbar} data-testid={dataTestId}>
    {isEditorOpen ? (
      <ToolbarButton
        isHighlighted={false}
        variant="default"
        icon="chevronleft"
        label={t`Back to visualization`}
        c="brand"
        justify="start"
        className={cx(
          ToolbarButtonS.PrimaryToolbarButton,
          MobileToolbarS.LeftButton,
        )}
        onClick={toggleEditor}
      />
    ) : (
      withChartTypeSelector && (
        <ChartTypeDropdown
          className={MobileToolbarS.LeftButton}
          styles={{
            inner: { width: "100%" },
            label: { marginRight: "auto" },
          }}
        />
      )
    )}

    {rightButton?.({ className: MobileToolbarS.RightButton })}
  </Box>
);
