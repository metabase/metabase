//
//  AppDelegate.m
//  Metabase
//
//  Created by Cam Saul on 9/21/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import <Sparkle/Sparkle.h>

#import "AppDelegate.h"
#import "MainViewController.h"
#import "MetabaseTask.h"
#import "TaskHealthChecker.h"


@interface AppDelegate ()

@property (weak) IBOutlet NSWindow *window;

@property (strong, nonatomic) MetabaseTask *task;
@property (strong, nonatomic) TaskHealthChecker *healthChecker;

@end


static AppDelegate *sInstance = nil;


@implementation AppDelegate

+ (AppDelegate *)instance {
	return sInstance;
}

- (id)init {
	if (self = [super init]) {
		[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(taskTimedOut:) name:MetabaseTaskTimedOutNotification object:nil];
	}
	return self;
}

- (void)dealloc {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
	sInstance = self;
	
	[[SUUpdater sharedUpdater] checkForUpdatesInBackground];
	
	self.task = [MetabaseTask task];
	self.healthChecker.port = self.task.port;
	[self.healthChecker start];
}

- (void)applicationDidBecomeActive:(NSNotification *)notification {
	// re-start the health checker if it's not checking like it should be : the HEALTH CHECKER HEALTH CHECKER
	if (self.healthChecker.lastCheckTime) {
		const CFTimeInterval timeSinceLastHealthCheck = CFAbsoluteTimeGetCurrent() - self.healthChecker.lastCheckTime;
		if (timeSinceLastHealthCheck > 5.0f) {
			NSLog(@"Last health check was %.0f ago, restarting health checker!", timeSinceLastHealthCheck);
			[self.healthChecker start];
		}
	}
	// (re)start the health checker just to be extra double-safe it's still running
}

- (void)applicationWillTerminate:(NSNotification *)notification {
	self.task = nil;
}


#pragma mark - Notifications

- (void)taskTimedOut:(NSNotification *)notification {
	NSLog(@"Metabase task timed out. Restarting...");
	[self.healthChecker resetTimeout];
	self.task = [MetabaseTask task];
}


#pragma mark - Getters / Setters

- (TaskHealthChecker *)healthChecker {
	if (!_healthChecker) {
		_healthChecker = [[TaskHealthChecker alloc] init];
	}
	return _healthChecker;
}

- (void)setTask:(MetabaseTask *)task {
	[_task terminate];
	_task = task;
	[task launch];
}

- (NSUInteger)port {
	return self.task.port;
}

@end
