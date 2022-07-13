import cx from "classnames";
import React from "react";

const METHODS = ["GET", "POST", "PUT", "DELETE"];

type Props = {
  value: string;
  setValue: (value: string) => void;
};

const MethodSelector: React.FC<Props> = ({ value, setValue }: Props) => {
  return (
    <div>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a HTTP verb
        </label>
        <select
          id="tabs"
          name="tabs"
          className="block w-full border-gray-300 rounded-md focus:ring-accent0 focus:border-accent0"
          value={value}
          onChange={e => setValue(e.target.value)}
        >
          {METHODS.map(method => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <nav className="flex space-x-2" aria-label="Tabs">
          {METHODS.map(method => (
            <button
              key={method}
              className={cx(
                value === method ? "bg-accent0-light" : "",
                "px1 py-1 font-bold text-brand text-small rounded-md bg-opacity-25 hover:bg-accent0-light hover:bg-opacity-25",
              )}
              aria-current={method === value ? "page" : undefined}
              onClick={() => setValue(method)}
            >
              {method}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default MethodSelector;
