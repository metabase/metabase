//
//  SettingsManager.m
//  Metabase
//
//  Created by Cam Saul on 9/22/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "AppDelegate.h"
#import "SettingsManager.h"

static SettingsManager *sSettingsManager = nil;

static NSString * const BaseURLUserDefaultsKey = @"com.metabase.baseURL";

NSString *LocalHostBaseURL() {
	return [NSString stringWithFormat:@"http://localhost:%lu", [AppDelegate instance].port];
}


@implementation SettingsManager

+ (instancetype)instance {
	@synchronized(self) {
		if (!sSettingsManager) sSettingsManager = [[SettingsManager alloc] init];
	}
	return sSettingsManager;
}

#pragma mark - Getters / Setters

- (NSString *)baseURL {
	return [[NSUserDefaults standardUserDefaults] objectForKey:BaseURLUserDefaultsKey];
}

- (void)setBaseURL:(NSString *)baseURL {
	[[NSUserDefaults standardUserDefaults] setObject:[baseURL copy] forKey:BaseURLUserDefaultsKey];
	[[NSUserDefaults standardUserDefaults] synchronize];
}

@end
