import React from "react";
import Icon from "metabase/components/Icon";
import { t, jt } from "c-3po";
const SURVEY_LINK =
  "https://docs.google.com/forms/d/e/1FAIpQLSc92WzF76ViiT8l4646lvFSWejNUhh4lhCSMXdZECILVwJG2A/viewform?usp=sf_link";

const PreviewBanner = () => (
  <div className="full py2 flex align-center justify-center full md-py3 text-centered text-slate text-paragraph bg-white border-bottom">
    <Icon
      name="beaker"
      size={28}
      className="mr1 text-brand"
      style={{ marginTop: -5 }}
    />
    <span>{jt`Welcome to the x-ray preview! We'd love ${(
      <a className="link" href={SURVEY_LINK} target="_blank">
        {t`your feedback`}
      </a>
    )}`}</span>
  </div>
);

export default PreviewBanner;
