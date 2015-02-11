package com.metabase.corvus.api;

public class APIException extends Exception {

    private final Integer statusCode;

    public APIException(Integer statusCode, String message) {
	super(message);
	this.statusCode = statusCode;
    }

    public Integer getStatusCode() {
	return this.statusCode;
    }
}
