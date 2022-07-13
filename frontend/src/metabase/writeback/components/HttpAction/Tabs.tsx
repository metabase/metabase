import React from "react";
import cx from "classnames";

type Tab = {
  name: string;
  label: string | React.ReactNode;
};

type Props = {
  tabs: Tab[];
  currentTab: string;
  setCurrentTab: (tab: string) => void;
};

const Tabs: React.FC<Props> = ({ tabs, currentTab, setCurrentTab }: Props) => {
  return (
    <div className="flex space-x-2 prose">
      {tabs.map(({ name, label }) => (
        <button
          key={name}
          className={cx(
            currentTab === name
              ? "text-accent0"
              : "text-gray-500 hover:text-gray-700",
            "px-3 py-2 font-bold text-small rounded-md",
          )}
          onClick={() => setCurrentTab(name)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default Tabs;
