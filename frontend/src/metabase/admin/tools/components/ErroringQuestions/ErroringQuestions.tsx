import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";

import { UpsellPerformanceTools } from "metabase/admin/upsells";
import { SettingsPageWrapper, SettingsSection } from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";

interface ErroringQuestion {
  card_id: number;
  name: string;
  error: string;
  collection?: string;
  database?: string;
  last_run_at?: string;
  [key: string]: any;
}

interface ErroringQuestionsProps {
  questions?: ErroringQuestion[];
  isLoading?: boolean;
  error?: unknown;
}

/**
 * OSS component for erroring questions page.
 * In the open-source version, this shows an upsell for the performance tools feature.
 * However, if erroring questions data is provided (in edge cases), this component
 * ensures proper click handling to navigate to the question editor.
 */
export const ErroringQuestions = ({ questions, isLoading, error }: ErroringQuestionsProps) => {
  const dispatch = useDispatch();

  const onClickQuestion = (question: ErroringQuestion) => {
    // Navigate to the question editor where users can view and fix the error
    dispatch(push(`/question/${question.card_id}`));
  };

  // If no questions data is provided, show the upsell (default OSS behavior)
  if (!questions || (questions.length === 0 && !isLoading && !error)) {
    return (
      <SettingsPageWrapper title={t`Questions that errored when last run`}>
        <SettingsSection>
          <UpsellPerformanceTools source="admin-tools-errors" />
        </SettingsSection>
      </SettingsPageWrapper>
    );
  }

  // If questions data is available, show the table with proper click handling
  return (
    <SettingsPageWrapper title={t`Questions that errored when last run`}>
      <SettingsSection>
        <table className={cx(AdminS.ContentTable, CS.mt2)} data-testid="erroring-questions-table">
          <thead>
            <tr>
              <th>{t`Question`}</th>
              <th>{t`Collection`}</th>
              <th>{t`Database`}</th>
              <th>{t`Error`}</th>
              <th>{t`Last Run`}</th>
            </tr>
          </thead>
          <tbody>
            {(isLoading || error) && (
              <tr>
                <td colSpan={5}>
                  <LoadingAndErrorWrapper loading={isLoading} error={error} />
                </td>
              </tr>
            )}

            {!isLoading && !error && (
              <>
                {questions.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <Flex c="text-light" justify="center">{t`No erroring questions found`}</Flex>
                    </td>
                  </tr>
                )}

                {questions.map((question) => (
                  <tr
                    key={question.card_id}
                    className={CS.cursorPointer}
                    onClick={() => onClickQuestion(question)}
                    data-testid="erroring-question-row"
                  >
                    <td className={CS.textBold}>{question.name}</td>
                    <td>{question.collection}</td>
                    <td>{question.database}</td>
                    <td className={CS.textError} title={question.error}>
                      {question.error.substring(0, 100)}{question.error.length > 100 ? '...' : ''}
                    </td>
                    <td>{question.last_run_at}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        <Box mt="md" c="text-medium">
          <p>{t`Click on a question to view and fix the error.`}</p>
        </Box>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};