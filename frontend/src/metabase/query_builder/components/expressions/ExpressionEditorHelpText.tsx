import React from "react";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/core/components/ExternalLink";
import Icon from "metabase/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";

type Arg = {
  name: string;
  description: string;
};

type HelpText = {
  args: Arg[];
  description: string;
  example: string;
  structure: string;
};

interface HelpTextProps {
  helpText: HelpText;
  width: number;
  target: Element;
}

const HelpText = ({ helpText, width, target }: HelpTextProps) => {
  if (!helpText) {
    return null;
  }

  return (
    <TippyPopover
      maxWidth={width}
      reference={target}
      placement="bottom-start"
      visible
      content={
        <>
          {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
          <div onMouseDown={e => e.preventDefault()}>
            <p
              className="p2 m0 text-monospace text-bold"
              style={{ background: color("bg-yellow") }}
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
                href={MetabaseSettings.docsUrl(
                  "questions/query-builder/expressions",
                )}
              >
                <Icon name="reference" size={12} className="mr1" />
                {t`Learn more`}
              </ExternalLink>
            </div>
          </div>
        </>
      }
    ></TippyPopover>
  );
};

export default HelpText;
