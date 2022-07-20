import cx from "classnames";
import React from "react";

import { Tabs, Tab } from "./MethodSelector.styled";

const METHODS = ["GET", "POST", "PUT", "DELETE"];

type Props = {
  value: string;
  setValue: (value: string) => void;
};

const MethodSelector: React.FC<Props> = ({ value, setValue }: Props) => {
  return (
    <div>
      <Tabs className="flex space-x-2" aria-label="Tabs">
        {METHODS.map(method => (
          <Tab
            key={method}
            className={cx(
              value === method ? "bg-accent0-light" : "",
              "px1 py-1 font-bold text-brand text-sm rounded-md bg-opacity-25 hover:bg-accent0-light hover:bg-opacity-25",
            )}
            aria-current={method === value ? "page" : undefined}
            onClick={() => setValue(method)}
          >
            {method}
          </Tab>
        ))}
      </Tabs>
    </div>
  );
};

export default MethodSelector;
