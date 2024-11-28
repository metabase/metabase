import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import S from "./ViewFooterControl.module.css"
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  getFirstQueryResult,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Group, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ViewFooterRoot } from "../ViewFooter.styled";

import { ConvertToNativeQuestionButton } from "./ConvertToNativeQuestionButton";
import { LeftViewFooterButtonGroup } from "./LeftViewFooterButtonGroup";
import { RightViewFooterButtonGroup } from "./RightViewFooterButtonGroup";

type ViewFooterProps = {
  className?: string;
  isResultDirty: boolean;
  setQueryBuilderMode?: (mode: string) => Promise<void>;
  isDirty: boolean;
  runQuestionQuery: () => Promise<void>;
  hasVisualizeButton?: boolean;
  isNotebook: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  isNative: boolean;
  isRunning: boolean;
};

export const ViewFooter = ({
  className,
  isResultDirty,
  setQueryBuilderMode,
  isDirty,
  runQuestionQuery,
  updateQuestion,
  isNotebook,
  hasVisualizeButton = true,
  isNative,
  isRunning,
}: ViewFooterProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);
  const shouldHideFooterForNativeQuestionWithoutResult = isNative && !result;

  const { isShowingNotebookNativePreview } = useSelector(getUiControls);
  const [showViewControl, setShowViewControl] = useState(!isNotebook);
  const [enableOpacity, setEnableOpacity] = useState(false);
  const [showButton, setShowButton] = useState(isNotebook);

  useEffect(() => {
    if (isNotebook && hasVisualizeButton && isResultDirty) {
      if (!showButton) {
        setShowButton(true);
        setShowViewControl(false);
      }
    }
  }, [hasVisualizeButton, isNotebook, isResultDirty, showButton]);

  const viewControlRef = useRef(null);
  const buttonRef = useRef(null);

  if (!question || shouldHideFooterForNativeQuestionWithoutResult) {
    return null;
  }

  async function cleanupQuestion() {
    // Converting a query to MLv2 and back performs a clean-up
    let cleanQuestion = question?.setQuery(
      Lib.dropEmptyStages(question?.query()),
    );

    if (cleanQuestion?.display() === "table") {
      cleanQuestion = cleanQuestion.setDefaultDisplay();
    }

    if (cleanQuestion) {
      await updateQuestion(cleanQuestion);
    }
  }

  // visualize switches the view to the question's visualization.
  async function visualize() {
    // Only cleanup the question if it's dirty, otherwise Metabase
    // will incorrectly display the Save button, even though there are no changes to save.
    if (isDirty) {
      cleanupQuestion();
    }

    // tell segment control in the footer to switch to visualization
    dispatch(
      setUIControls({
        isShowingRawTable: false,
        viewFooterControlState: "visualization",
      }),
    );

    // switch mode before running otherwise URL update may cause it to switch back to notebook mode
    await setQueryBuilderMode?.("view");
    if (isResultDirty) {
      await runQuestionQuery();
    }
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hideChartSettings =
    (result?.error && !isEditable) || question.isArchived();
  const shouldRenderVizButton = isNotebook && hasVisualizeButton && isResultDirty;


  return (
    <ViewFooterRoot
      className={cx(className, CS.textMedium, CS.borderTop, CS.fullWidth)}
      data-testid="view-footer"
    >
      <Group position="apart" pos="relative" noWrap w="100%">
        {/* {isNotebook && hasVisualizeButton && isResultDirty ? ( */}
        <CSSTransition in={showButton} key="visualize-button" timeout={300} nodeRef={buttonRef}
          unmountOnExit
          onEnter={() => console.log("on enter")}
          onEntered={() => {
            console.log("enable opacity");
          }}
          onExited={() => {
            console.log("on Exited");
            // setEnableOpacity(false);
            setShowViewControl(true);
          }}
          classNames={{
            enter: S.buttonEnter,
            enterActive: S.buttonEnterActive,
            exit: S.buttonExit,
            exitActive: S.buttonExitActive,
            enterDone: S.buttonEnterDone
          }}>
          <Button
            ref={buttonRef}
            variant="filled"
            radius="xl"
            pt={rem(7)}
            pb={rem(7)}
            miw={190}
            onClick={() => {
              // visualize();
              setShowButton(false);
            }}
          >
            {t`Visualize`}
          </Button>
        </CSSTransition>
        {/* <CSSTransition nodeRef={viewControlRef} timeout={300} key="view-footer-control" unmountOnExit in={showViewControl} onExited={() => { console.log("on exited") }} onEnter={() => { console.log("on enter") }}>
          <LeftViewFooterButtonGroup
            ref={viewControlRef}
            question={question}
            hideChartSettings={hideChartSettings}
            isResultLoaded={!!result}
            isRunning={isRunning}
            isNotebook={isNotebook}
          />
        </CSSTransition> */}
        {isNotebook ? (
          isShowingNotebookNativePreview ? (
            <ConvertToNativeQuestionButton />
          ) : null
        ) : (
          <RightViewFooterButtonGroup />
        )}
      </Group>
    </ViewFooterRoot>
  );
};
