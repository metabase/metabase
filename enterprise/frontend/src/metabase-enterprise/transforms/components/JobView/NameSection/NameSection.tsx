import { NameDescriptionInput } from "../../../components/NameDescriptionInput";
import type { TransformJobInfo } from "../types";

type NameSectionProps = {
  job: TransformJobInfo;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string | null) => void;
};

export function NameSection({
  job,
  onNameChange,
  onDescriptionChange,
}: NameSectionProps) {
  return (
    <NameDescriptionInput
      name={job.name}
      description={job.description}
      onNameChange={onNameChange}
      onDescriptionChange={onDescriptionChange}
    />
  );
}
