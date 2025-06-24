import type * as React from "react";
import { useState } from "react";
import { msgid, ngettext } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type { DatabaseUsageInfo } from "metabase-types/api";

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
    <Stack gap="md">
      {question > 0 && (
        <Checkbox
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
        <Checkbox
          label={ngettext(
            msgid`Delete ${dataset} model`,
            `Delete ${dataset} models`,
            dataset,
          )}
          name="dataset"
          checked={confirmations["dataset"]}
          onChange={handleChange}
        />
      )}
      {metric > 0 && (
        <Checkbox
          label={ngettext(
            msgid`Delete ${metric} metric`,
            `Delete ${metric} metrics`,
            metric,
          )}
          name="metric"
          checked={confirmations["metric"]}
          onChange={handleChange}
        />
      )}
      {segment > 0 && (
        <Checkbox
          label={ngettext(
            msgid`Delete ${segment} segment`,
            `Delete ${segment} segments`,
            segment,
          )}
          name="segment"
          checked={confirmations["segment"]}
          onChange={handleChange}
        />
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ContentRemovalConfirmation;
