import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import colors from "metabase/lib/colors";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";

const propTypes = {
  helpText: PropTypes.object,
  width: PropTypes.number,
};

const HelpText = ({ helpText, width }) =>
  helpText ? (
    <Popover
      tetherOptions={{
        attachment: "top left",
        targetAttachment: "bottom left",
      }}
      style={{ width }}
      isOpen
    >
      {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
      <div onMouseDown={e => e.preventDefault()}>
        <p
          className="p2 m0 text-monospace text-bold"
          style={{ background: colors["bg-yellow"] }}
        >
          {helpText.structure}
        </p>
        <div className="p2 border-top">
          <p className="mt0 text-bold">{helpText.description}</p>
          <p className="text-code m0 text-body">{helpText.example}</p>
        </div>
        <div className="p2 border-top">
          {helpText.args.map(({ name, description }, index) => (
            <div key={index}>
              <h4 className="text-medium">{name}</h4>
              <p className="mt1 text-bold">{description}</p>
            </div>
          ))}
          <ExternalLink
            className="link text-bold block my1"
            target="_blank"
            href={MetabaseSettings.docsUrl("users-guide/expressions")}
          >
            <Icon name="reference" size={12} className="mr1" />
            {t`Learn more`}
          </ExternalLink>
        </div>
      </div>
    </Popover>
  ) : null;

HelpText.propTypes = propTypes;

export default HelpText;
