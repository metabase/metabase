/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import InputBlurChange from "metabase/components/InputBlurChange";

import { Heading } from "./ClickBehaviorSidebar.styled";

const CustomLinkText = ({ clickBehavior, updateSettings }) => {
  return (
    <div className="mt2 mb1">
      <Heading>{t`Customize link text (optional)`}</Heading>
      <InputBlurChange
        className="input block full"
        placeholder={t`E.x. Details for {{Column Name}}`}
        value={clickBehavior.linkTextTemplate}
        onBlurChange={e =>
          updateSettings({
            ...clickBehavior,
            linkTextTemplate: e.target.value,
          })
        }
      />
    </div>
  );
};

export default CustomLinkText;
