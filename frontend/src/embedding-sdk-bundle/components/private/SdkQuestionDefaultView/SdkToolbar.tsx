import cx from "classnames";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { ChartTypeDropdown } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ChartTypeDropdown";
import { QuestionSettingsDropdown } from "embedding-sdk-bundle/components/private/SdkQuestion/components/QuestionSettings";
import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { ToolbarButton } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/ToolbarButton";
import ToolbarButtonS from "embedding-sdk-bundle/components/private/SdkQuestion/styles/ToolbarButton.module.css";
import { Box, Button, Divider, Group, PopoverBackButton } from "metabase/ui";

import { RenderIfHasContent } from "../RenderIfHasContent/RenderIfHasContent";

import S from "./SdkToolbar.module.css";

const MOBILE_CHART_TYPE_STYLES = {
  inner: { width: "100%" },
  label: { marginRight: "auto" },
};

type SdkToolbarProps = {
  isMobile: boolean;

  /** Show chart type selector in the left slot. */
  withChartTypeSelector?: boolean;

  /** Show QuestionSettingsDropdown grouped with chart type on desktop. Desktop only. */
  withQuestionSettings?: boolean;

  /** Show back button instead of chart type (editor open state). */
  isEditorOpen?: boolean;
  onToggleEditor?: () => void;

  /** Extra desktop-only controls after divider (filters, summarize, breakout). Desktop only. */
  desktopExtra?: ReactNode;

  /** Right-side controls. Receives isMobile and className for mobile button sizing. */
  right?: (props: { isMobile: boolean; className: string }) => ReactNode;

  "data-testid"?: string;
};

export const SdkToolbar = forwardRef<HTMLDivElement, SdkToolbarProps>(
  function SdkToolbar(
    {
      isMobile,
      withChartTypeSelector,
      withQuestionSettings,
      isEditorOpen,
      onToggleEditor,
      desktopExtra,
      right,
      "data-testid": dataTestId,
    },
    ref,
  ) {
    if (isMobile) {
      return (
        <Box ref={ref} className={S.MobileToolbar} data-testid={dataTestId}>
          {isEditorOpen ? (
            <ToolbarButton
              isHighlighted={false}
              variant="default"
              icon="chevronleft"
              label={t`Back to visualization`}
              c="brand"
              justify="start"
              className={cx(ToolbarButtonS.PrimaryToolbarButton, S.LeftButton)}
              onClick={onToggleEditor}
            />
          ) : (
            withChartTypeSelector && (
              <ChartTypeDropdown
                className={S.LeftButton}
                styles={MOBILE_CHART_TYPE_STYLES}
              />
            )
          )}
          {right?.({ isMobile: true, className: S.RightButton })}
        </Box>
      );
    }

    return (
      <ResultToolbar ref={ref} data-testid={dataTestId}>
        <RenderIfHasContent component={Group} gap="xs">
          {isEditorOpen ? (
            <PopoverBackButton
              onClick={onToggleEditor}
              c="brand"
              fz="md"
              ml="sm"
            >
              {t`Back to visualization`}
            </PopoverBackButton>
          ) : (
            <>
              {withChartTypeSelector &&
                (withQuestionSettings ? (
                  <Button.Group>
                    <ChartTypeDropdown />
                    <QuestionSettingsDropdown />
                  </Button.Group>
                ) : (
                  <ChartTypeDropdown />
                ))}

              {desktopExtra && withChartTypeSelector && (
                <Divider
                  mx="xs"
                  orientation="vertical"
                  style={{ color: "var(--mb-color-border) !important" }}
                />
              )}

              {desktopExtra}
            </>
          )}
        </RenderIfHasContent>
        <RenderIfHasContent component={Group} gap="sm" ml="auto">
          {right?.({ isMobile: false, className: "" })}
        </RenderIfHasContent>
      </ResultToolbar>
    );
  },
);
