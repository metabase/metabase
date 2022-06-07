import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio/index.ts";
import Select, { Option } from "metabase/core/components/Select";
import TextInput from "metabase/components/TextInput";

function ChannelFields({ channel, channelSpec, onChannelPropertyChange }) {
  const [channelType, setChannelType] = useState("public");
  const [privateChannelText, setPrivateChannelText] = useState("");

  const channelTypeOptions = [
    { name: t`A public channel`, value: "public" },
    { name: t`A private channel`, value: "private" },
  ];

  const handlePrivateChannelTextChange = (field, value) => {
    setPrivateChannelText(value);

    onChannelPropertyChange("details", {
      ...channel.details,
      [field.name]: value,
    });
  };

  const handleChannelTypeChange = channelType => {
    setChannelType(channelType);
  };

  const valueForField = field => {
    const value = channel?.details?.[field.name];
    return value != null ? value : null; // convert undefined to null so Uncontrollable doesn't ignore changes
  };

  return (
    <div>
      {channelSpec.fields.map(field => (
        <div key={field.name} className={field.name}>
          <span className="block text-bold pb2">{field.displayName}</span>

          {field.type === "select" ? (
            <>
              <Radio
                variant="bubble"
                value={channelType}
                options={channelTypeOptions}
                onChange={handleChannelTypeChange}
              />

              {channelType === "public" && (
                <Select
                  className="text-bold bg-white inline-block pt2 full-width"
                  value={valueForField(field)}
                  placeholder={t`Pick a user or channel...`}
                  searchProp="name"
                  // Address #5799 where `details` object is missing for some reason
                  onChange={o =>
                    onChannelPropertyChange("details", {
                      ...channel.details,
                      [field.name]: o.target.value,
                    })
                  }
                >
                  {field.options.map(option => (
                    <Option key={option} name={option} value={option}>
                      {option}
                    </Option>
                  ))}
                </Select>
              )}

              {channelType === "private" && (
                <TextInput
                  className="pt2"
                  value={privateChannelText}
                  placeholder={t`Fill name of private channel`}
                  autoFocus
                  aria-autocomplete="list"
                  onChange={value =>
                    handlePrivateChannelTextChange(field, value)
                  }
                />
              )}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

ChannelFields.propTypes = {
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
};

export default ChannelFields;
