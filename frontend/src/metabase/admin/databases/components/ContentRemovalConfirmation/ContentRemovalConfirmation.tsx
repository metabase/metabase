import React, { useState } from "react";
import { msgid, ngettext, t } from "ttag";
import { DatabaseUsageInfo } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import { ConfirmationCheckbox } from "./ContentRemovalConfirmation.styled";

interface ContentRemovalConfirmationProps {
  usageInfo: DatabaseUsageInfo;
  onChange: (isConfirmed: boolean) => void;
}

const ContentRemovalConfirmation = ({
  usageInfo,
  onChange,
}: ContentRemovalConfirmationProps) => {
  const { question, dataset, metric, segment } = usageInfo;

  const [confirmations, setConfirmations] = useState({
    question: question === 0,
    dataset: dataset === 0,
    metric: metric === 0,
    segment: segment === 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;

    const updatedConfirmations = { ...confirmations, [name]: checked };
    setConfirmations(updatedConfirmations);

    const isConfirmed = Object.values(updatedConfirmations).every(Boolean);
    onChange(isConfirmed);
  };

  return (
    <div>
      {question > 0 && (
        <ConfirmationCheckbox
          checkedColor={color("error")}
          label={ngettext(
            msgid`Delete ${question} saved question`,
            `Delete ${question} saved questions`,
            question,
          )}
          name="question"
          checked={confirmations["question"]}
          onChange={handleChange}
        />
      )}
      {dataset > 0 && (
        <ConfirmationCheckbox
          checkedColor={color("error")}
          label={ngettext(
            msgid`Delete ${question} model`,
            `Delete ${question} models`,
            question,
          )}
          name="dataset"
          checked={confirmations["dataset"]}
          onChange={handleChange}
        />
      )}
      {metric > 0 && (
        <ConfirmationCheckbox
          checkedColor={color("error")}
          label={ngettext(
            msgid`Delete ${question} metric`,
            `Delete ${question} metrics`,
            question,
          )}
          name="metric"
          checked={confirmations["metric"]}
          onChange={handleChange}
        />
      )}
      {segment > 0 && (
        <ConfirmationCheckbox
          checkedColor={color("error")}
          label={ngettext(
            msgid`Delete ${question} segment`,
            `Delete ${question} segments`,
            question,
          )}
          name="segment"
          checked={confirmations["segment"]}
          onChange={handleChange}
        />
      )}
    </div>
  );
};

export default ContentRemovalConfirmation;
