import { memo } from "react";
import { t } from "ttag";

import { QueryButton } from "metabase/common/components/QueryButton";
import D from "metabase/reference/components/Detail.module.css";

import S from "./UsefulQuestions.module.css";

interface UsefulQuestionsProps {
  questions: { text: string; icon: string; link: string }[];
}

const UsefulQuestions = ({ questions }: UsefulQuestionsProps) => (
  <div className={D.detail}>
    <div className={D.detailBody}>
      <div className={D.detailTitle}>
        <span>{t`Potentially useful questions`}</span>
      </div>
      <div className={S.usefulQuestions}>
        {questions.map((question, index) => (
          <QueryButton key={index} {...question} />
        ))}
      </div>
    </div>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(UsefulQuestions);
