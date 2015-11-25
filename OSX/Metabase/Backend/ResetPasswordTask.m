//
//  ResetPasswordTask.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "ResetPasswordTask.h"

@interface ResetPasswordTask ()
@property (nonatomic, readonly) NSString *resetPasswordJarPath;
@property (copy) NSString *output;
@end

@implementation ResetPasswordTask


#pragma mark - Local Methods

- (void)resetPasswordForEmailAddress:(NSString *)emailAddress success:(void (^)(NSString *))successBlock error:(void (^)(NSString *))errorBlock {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		self.task				= [[NSTask alloc] init];
		self.task.launchPath	= JREPath();
		self.task.arguments		= @[@"-classpath", [NSString stringWithFormat:@"%@:%@", UberjarPath(), self.resetPasswordJarPath],
									@"metabase.reset_password.core",
									DBPath(), emailAddress];
		
		
		__weak ResetPasswordTask *weakSelf = self;
		self.task.terminationHandler = ^(NSTask *task) {
			NSLog(@"ResetPasswordTask terminated with status: %d", task.terminationStatus);
			dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5f * NSEC_PER_SEC)), dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
				[weakSelf terminate];
				
				dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5f * NSEC_PER_SEC)), dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
					dispatch_async(dispatch_get_main_queue(), ^{
						if (!task.terminationStatus && weakSelf.output.length) {
							successBlock(weakSelf.output);
						} else {
							errorBlock(weakSelf.output.length ? weakSelf.output : @"An unknown error has occured.");
						}
					});
				});
			});
		};
		
		NSLog(@"Launching ResetPasswordTask\n%@ -classpath %@:%@ metabase.reset_password.core %@ %@", JREPath(), UberjarPath(), self.resetPasswordJarPath, DBPath(), emailAddress);
		// delay lauch just a second to make sure pipe is all set up, etc.
		dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5f * NSEC_PER_SEC)), dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
			[self.task launch];
		});
	});
}

- (void)readHandleDidRead:(NSString *)message {
	/// output comes back like "STATUS [[[message]]]"
	NSRegularExpression *regex	= [NSRegularExpression regularExpressionWithPattern:@"^(?:(?:OK)||(?:FAIL))\\s+\\[\\[\\[(.+)\\]\\]\\]\\s*$" options:NSRegularExpressionAnchorsMatchLines|NSRegularExpressionAllowCommentsAndWhitespace error:NULL];
	NSString *result			= [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@"$1"];
	if (result) {
		self.output = result;
		NSLog(@"[PasswordResetTask] %@", self.output);
	} else {
		NSLog(@"[PasswordResetTask - Bad Output] %@", message);
	}
}


#pragma mark - Getters / Setters

- (NSString *)resetPasswordJarPath {
	return [[NSBundle mainBundle] pathForResource:@"reset-password" ofType:@"jar"];
}

@end
