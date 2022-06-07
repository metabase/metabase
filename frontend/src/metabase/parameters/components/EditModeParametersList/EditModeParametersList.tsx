import React from "react";
import cx from "classnames";

import { SortableContainer } from "metabase/components/sortable";
import EditModeParameter from "metabase/parameters/components/EditModeParameter";
import { UiParameter } from "metabase/parameters/types";

type EditModeParametersList = {
  className?: string;
  parameters: UiParameter[];
  editingParameter?: UiParameter;
  setParameterIndex: (id: string, index: number) => void;
  setEditingParameter: (id: string | null) => void;
};

function EditModeParametersList({
  className,
  parameters,
  editingParameter,
  setParameterIndex,
  setEditingParameter,
}: EditModeParametersList) {
  const handleSortStart = () => {
    document.body.classList.add("grabbing");
  };

  const handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => {
    document.body.classList.remove("grabbing");
    if (setParameterIndex) {
      setParameterIndex(parameters[oldIndex].id, newIndex);
    }
  };

  return (
    <Container
      className={cx(className, "flex align-end flex-wrap flex-row")}
      axis="x"
      distance={9}
      onSortStart={handleSortStart}
      onSortEnd={handleSortEnd}
      helperClass={undefined}
    >
      {parameters.map((parameter, index) => (
        <EditModeParameter
          key={parameter.id}
          index={index}
          parameter={parameter}
          isEditingParameter={parameter.id === editingParameter?.id}
          setEditingParameter={setEditingParameter}
        />
      ))}
    </Container>
  );
}

const Container = SortableContainer(
  ({
    children,
    className,
  }: {
    children: React.ReactChild;
    className: string;
  }) => {
    return <div className={className}>{children}</div>;
  },
);

export default EditModeParametersList;
