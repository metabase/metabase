package com.metabase.corvus.api;

public class ApiException extends Exception {

    private final Integer statusCode;

    public ApiException(Integer statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }

    public Integer getStatusCode() {
	return this.statusCode;
    }
}
