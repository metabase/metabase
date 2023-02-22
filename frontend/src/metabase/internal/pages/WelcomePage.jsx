import React from "react";

import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";

import ProgressBar from "metabase/components/ProgressBar";

import { stats } from "../lib/components-webpack";
import {
  PageBody,
  PageContent,
  PageFooter,
  PageHeader,
} from "./WelcomePage.styled";

const WelcomePage = () => {
  return (
    <div className="wrapper wrapper--trim">
      <PageHeader>
        <Heading>Metabase Style Guide</Heading>
        <Text>
          Reference and samples for how to make things the Metabase way.
        </Text>
      </PageHeader>

      <Subhead>Documentation progress</Subhead>
      <Text>
        Documenting our component library is an ongoing process. Here&apos;s
        what percentage of the code in <code>metabase/components</code> has some
        form of documentation so far.
      </Text>

      <PageBody>
        <ProgressBar percentage={stats.ratio} />
        <PageContent>
          <div>
            <Subhead>{stats.documented}</Subhead>
            <Text>Documented</Text>
          </div>
          <PageFooter>
            <Subhead>{stats.total}</Subhead>
            <Text>Total .jsx files in /components</Text>
          </PageFooter>
        </PageContent>
      </PageBody>
    </div>
  );
};

export default WelcomePage;
