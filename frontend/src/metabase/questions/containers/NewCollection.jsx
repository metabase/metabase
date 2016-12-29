import React from "react";

import Button from "metabase/components/Button";
import ColorPicker from "metabase/components/ColorPicker";
import FormField from "metabase/components/FormField";
import Icon from "metabase/components/Icon";
import Input from "metabase/components/Input";

const NewCollection = () =>
    <div className="wrapper">
        <div className="py4 flex align-center">
            <h1 className="ml-auto text-bold">New collection</h1>
            <Icon
                className="ml-auto text-grey-4 cursor-pointer"
                name="close"
                width="36"
                height="36"
            />
        </div>
        <div className="NewForm ml-auto mr-auto mt4 pt2" style={{ width: 540 }}>
            <div>
                <FormField
                    displayName="Name"
                    fieldName="name"
                >
                    <Input
                        name="name"
                        className="Form-input full"
                        placeholder="My new fantastic collection"
                        autofocus
                    />
                </FormField>

                <FormField
                    displayName="Description"
                    fieldName="description"
                >
                    <textarea className="Form-input full" name="description" placeholder="It's optional but oh, so helpful" />
                </FormField>
                <FormField
                    displayName="Color"
                    fieldName="color"
                >
                    <ColorPicker
                        currentColor="#509EE3"
                        onChange={() => console.log('change color') }
                    />
                </FormField>
            </div>
            <div className="flex">
                <div className="inline-block ml-auto">
                    <Button
                        className="mr1"
                        onClick={() => console.log('we be canceling') }
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => console.log('we be creating') }
                        primary
                    >
                        Create
                    </Button>
                </div>
            </div>
        </div>
    </div>

export default NewCollection;
