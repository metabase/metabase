package com.metabase.corvus.api;

public class ApiFieldValidationException extends ApiException {

    private final String fieldName;

    public ApiFieldValidationException(String fieldName, String message) {
        super(400, message);
        this.fieldName = fieldName;
    }

    public String getFieldName() {
        return this.fieldName;
    }
}
