//
//  TaskHealthChecker.m
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "TaskHealthChecker.h"

/// Check out health every this many seconds
static const CGFloat HealthCheckIntervalSeconds = 1.0f;

/// This number should be lower than HealthCheckIntervalSeconds so requests don't end up piling up
static const CGFloat HealthCheckRequestTimeout = 1.75f;

@interface TaskHealthChecker ()
@property (strong, nonatomic) NSOperationQueue *healthCheckOperationQueue;
@property (strong, nonatomic) NSTimer *healthCheckTimer;

@property (nonatomic) BOOL healthy;

/// Set this to YES after server has started successfully one time
/// we'll hold of on the whole killing the Metabase server until it launches one time, I guess
@property (nonatomic) BOOL hasEverBeenHealthy;
@end

@implementation TaskHealthChecker

- (void)dealloc {
	[self stop];
}


#pragma mark - Local Methods

- (void)start {
	NSLog(@"(re)starting health checker @ 0x%zx...", (size_t)self);
	self.healthCheckOperationQueue = [[NSOperationQueue alloc] init];
	self.healthCheckOperationQueue.maxConcurrentOperationCount = 1;
	
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		self.healthCheckTimer = [NSTimer timerWithTimeInterval:HealthCheckIntervalSeconds target:self selector:@selector(checkHealth) userInfo:nil repeats:YES];
		self.healthCheckTimer.tolerance = HealthCheckIntervalSeconds / 2.0f;
		[[NSRunLoop mainRunLoop] addTimer:self.healthCheckTimer forMode:NSRunLoopCommonModes];
	});
}


- (void)stop {
	self.healthCheckTimer = nil;
	self.healthCheckOperationQueue = nil;
}

- (void)checkHealth:(void(^)(BOOL healthy))completion {
	/// Cancel any pending checks so they don't pile up indefinitely
	[self.healthCheckOperationQueue cancelAllOperations];
		
	NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:[NSString stringWithFormat:@"http://localhost:%lu/api/health", self.port]] cachePolicy:NSURLRequestReloadIgnoringCacheData timeoutInterval:HealthCheckRequestTimeout];
	
	[NSURLConnection sendAsynchronousRequest:request queue:self.healthCheckOperationQueue completionHandler:^(NSURLResponse *response, NSData *data, NSError *connectionError) {
		
		if (connectionError) {
			completion(NO);
			return;
		}
		
		NSError *jsonError = nil;
		NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingAllowFragments error:&jsonError];
		
		if (jsonError) {
			completion(NO);
			return;
		}
		
		completion([json[@"status"] isEqualToString:@"ok"]);
	}];
}

- (void)checkHealth {
	// run the health check on the high-priorty GCD queue because it's imperative that it complete so we can get an accurate picture of Mac App health
	__weak TaskHealthChecker *weakSelf = self;
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		[weakSelf checkHealth:^(BOOL healthy) {
			if (!healthy) NSLog(@"😷");
			if (healthy && !weakSelf.healthy) NSLog(@"✅");
			
			weakSelf.healthy = healthy;
		}];
	});
}


#pragma mark - Getters / Setters

- (void)setHealthCheckTimer:(NSTimer *)healthCheckTimer {
	[_healthCheckTimer invalidate];
	_healthCheckTimer = healthCheckTimer;
}

- (void)setHealthCheckOperationQueue:(NSOperationQueue *)healthCheckOperationQueue {
	[_healthCheckOperationQueue cancelAllOperations];
	_healthCheckOperationQueue = healthCheckOperationQueue;
}

- (void)setHealthy:(BOOL)healthy {
	if (_healthy == healthy) return;
	
	_healthy = healthy;
    NSLog(@"Server is now %@", healthy ? @"HEALTHY" : @"UNHEALTHY");
    
	__weak TaskHealthChecker *weakSelf = self;
	NSString *notification = healthy ? MetabaseTaskBecameHealthyNotification : MetabaseTaskBecameUnhealthyNotification;
	[[NSNotificationCenter defaultCenter] postNotificationName:notification object:weakSelf];
}

@end
