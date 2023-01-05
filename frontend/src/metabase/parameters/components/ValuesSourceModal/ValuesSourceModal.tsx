import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import ModalContent from "metabase/components/ModalContent";
import { UiParameter } from "metabase-lib/parameters/types";
import {
  ModalLabel,
  ModalLayout,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./ValuesSourceModal.styled";

const SOURCE_TYPE_OPTIONS = [
  { name: t`From this field`, value: null },
  { name: t`Custom list`, value: "static-list" },
];

export interface ValuesSourceModalProps {
  parameter: UiParameter;
  onClose?: () => void;
}

const ValuesSourceModal = ({
  parameter,
  onClose,
}: ValuesSourceModalProps): JSX.Element => {
  const [sourceType, setSourceType] = useState(parameter.values_source_type);

  return (
    <ModalContent
      title={t`Selectable values for ${parameter.name}`}
      footer={[<Button key="submit" primary>{t`Done`}</Button>]}
      onClose={onClose}
    >
      <ModalLayout>
        <ModalPane>
          <ModalSection>
            <ModalLabel>{t`Where values should come from`}</ModalLabel>
            <Radio
              value={sourceType}
              options={SOURCE_TYPE_OPTIONS}
              vertical
              onChange={setSourceType}
            />
          </ModalSection>
        </ModalPane>
        <ModalMain>
          <ModalTextArea fullWidth />
        </ModalMain>
      </ModalLayout>
    </ModalContent>
  );
};

export default ValuesSourceModal;
