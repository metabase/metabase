/* eslint-disable no-console */

// don't use this for real, it's for easy prototyping and debugging only
import { Form } from "formik";
import { useState } from "react";
import { useMount } from "react-use";

import { POST } from "metabase/lib/api";
import { Button, Stack } from "metabase/ui";

import LoadingAndErrorWrapper from "./components/LoadingAndErrorWrapper";
import FormTextArea from "./core/components/FormTextArea";
import { FormProvider, FormTextInput } from "./forms";

export function DevDebug() {
  const [myData, setMyData] = useState(null);
  const getData = async () => {
    setMyData({ direct: [], indirect: [], "raw-parse": {} });
  };

  const postData = async newJsonData => {
    const response = await POST("/api/field/query_fields")(newJsonData);
    console.log({ response });
    return response;
  };

  const handleSubmit = async values => {
    const { dbId, query } = values;
    console.log({ dbId, query });

    const myQuery = { dbId, query };

    const response = await postData(myQuery);
    // shove the response data in the table after we get it
    setMyData(response);
  };

  // fetch data when the page loads
  useMount(getData);

  if (!myData) {
    // if there's no data yet, show a loading spinner
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <div style={{ padding: 32 }}>
      <h2>Macaw Helper</h2>
      <table style={{ marginBlock: 32 }}>
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {/* map over the object properties and display the key and value as a table row */}
          {Object.entries(myData).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{JSON.stringify(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <FormProvider
        initialValues={{
          dbId: 1,
          query: "SELECT * FROM products LIMIT 3",
        }}
        onSubmit={handleSubmit}
      >
        <Form style={{ marginBlock: 32 }}>
          <Stack gap="sm">
            <h2>Parse a query</h2>
            <FormTextInput name="dbId" placeholder="Database ID" />
            <FormTextArea name="query" placeholder="query" />
            <Button variant="filled" type="submit">
              Parse Query
            </Button>
          </Stack>
        </Form>
      </FormProvider>
    </div>
  );
}
