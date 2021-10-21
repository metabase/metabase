import React from "react";
import { t } from "ttag";
import OptionsMessage from "./OptionsMessage";

export default function EveryOptionState() {
  return (
    <OptionsMessage>
      {t`Including every option in your filter probably won’t do much…`}
    </OptionsMessage>
  );
}
