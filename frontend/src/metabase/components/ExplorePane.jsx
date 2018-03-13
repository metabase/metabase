import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import MetabotLogo from "metabase/components/MetabotLogo";

import { t } from "c-3po";

export const ExplorePane = ({ options, isSample }) => (
  <div>
    <div className="flex align-center">
      <MetabotLogo className="mr2" />
      <h3>
        <span>{t`Hi, Metabot here.`}</span>
      </h3>
    </div>
    <div className="mt2 mb4">
      <span>
        {isSample
          ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples from the sample dataset.`
          : `I took a look at the data you just connected, and I have some explorations for you to look at. I call these x-rays. Hope you like them!`}
      </span>
    </div>
    <ExploreList options={options} />
  </div>
);

export const ExploreList = ({ options }) => (
  <ol className="Grid Grid--1of2 Grid--gutters">
    {options &&
      options.map((option, index) => (
        <li className="Grid-cell" key={index}>
          <ExploreOption option={option} />
        </li>
      ))}
  </ol>
);

export const ExploreOption = ({ option }) => (
  <Link to={option.url} className="link flex align-center text-bold">
    <div
      className="bg-slate-almost-extra-light p2 flex align-center rounded mr1 justify-center text-gold"
      style={{ width: 48, height: 48 }}
    >
      <Icon name="bolt" size={32} />
    </div>
    <span>{option.title}</span>
  </Link>
);

export default ExplorePane;
