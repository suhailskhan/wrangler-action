import { afterEach, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { createGitHubDeployment, createJobSummary, createWorkersGitHubDeployment, createJobSummaryForWorkers } from "./github";
import { getOctokit } from "@actions/github";
import { mockGithubDeployments } from "../test/mocks";
import { getTestConfig } from "../test/test-utils";
import mockfs from "mock-fs";
import { readFile } from "fs/promises";

afterEach(() => {
	mockfs.restore();
});

describe("github", () => {
	it("Calls createGitHubDeployment successfully", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		await createGitHubDeployment({
			config: testConfig,
			octokit,
			productionBranch: "production-branch",
			deploymentId: "fake-deployment-id",
			projectName: "fake-project-name",
			deploymentUrl: "https://fake-deployment-url.com",
			environment: "production",
		});
		server.close();
	});

	it("Calls createWorkersGitHubDeployment successfully", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		await createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: "https://my-worker.example.workers.dev",
			workerName: "my-worker",
		});
		server.close();
	});

	it("Calls createWorkersGitHubDeployment successfully with custom domain", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		await createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: "https://my-custom-domain.com",
			workerName: "my-custom-domain", // Should be extracted from URL
		});
		server.close();
	});

	it("Handles invalid deployment URLs gracefully", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		
		// Test with invalid URL - should not throw, but should handle gracefully
		await expect(createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: "invalid-url-format",
			workerName: "my-worker",
		})).resolves.not.toThrow();
		
		server.close();
	});

	it("Handles URLs with descriptive text in parentheses", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		
		// Test with URL that has descriptive text in parentheses - should clean it up
		await expect(createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: "nextjs.aisk-svr.net (custom domain)", // Descriptive text in parentheses
			workerName: "my-worker",
		})).resolves.not.toThrow();
		
		server.close();
	});

	it("Handles URLs without protocol by adding https://", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		
		// Test with URL missing protocol - should add https:// automatically
		await expect(createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: "nextjs.aisk-svr.net", // No protocol
			workerName: "my-worker",
		})).resolves.not.toThrow();
		
		server.close();
	});

	it("Handles undefined deployment URLs gracefully", async () => {
		const githubUser = "mock-user";
		const githubRepoName = "wrangler-action";
		const server = setupServer(
			...mockGithubDeployments({ githubUser, githubRepoName }).handlers,
		);
		server.listen({ onUnhandledRequest: "error" });
		vi.stubEnv("GITHUB_REPOSITORY", `${githubUser}/${githubRepoName}`);

		const testConfig = getTestConfig();
		const octokit = getOctokit(testConfig.GITHUB_TOKEN, { request: fetch });
		
		// Test with undefined URL - should not throw
		await expect(createWorkersGitHubDeployment({
			config: testConfig,
			octokit,
			deploymentUrl: undefined,
			workerName: "my-worker",
		})).resolves.not.toThrow();
		
		server.close();
	});

	it("Calls createJobSummary successfully", async () => {
		vi.stubEnv("GITHUB_STEP_SUMMARY", "summary");
		mockfs({
			summary: mockfs.file(),
		});
		await createJobSummary({
			commitHash: "fake-commit-hash",
			deploymentUrl: "https://fake-deployment-url.com",
			aliasUrl: "https://fake-alias-url.com",
		});
		expect((await readFile("summary")).toString()).toMatchInlineSnapshot(`
			"
			# Deploying with Cloudflare Pages

			| Name                    | Result |
			| ----------------------- | - |
			| **Last commit:**        | fake-commit-hash |
			| **Preview URL**:        | https://fake-deployment-url.com |
			| **Branch Preview URL**: | https://fake-alias-url.com |
			  "
		`);
	});

	it("Calls createJobSummaryForWorkers successfully", async () => {
		vi.stubEnv("GITHUB_STEP_SUMMARY", "summary");
		mockfs({
			summary: mockfs.file(),
		});
		await createJobSummaryForWorkers({
			commitHash: "fake-commit-hash",
			deploymentUrl: "https://my-worker.example.workers.dev",
			workerName: "my-worker",
		});
		expect((await readFile("summary")).toString()).toMatchInlineSnapshot(`
			"
			# Deploying with Cloudflare Workers

			| Name                    | Result |
			| ----------------------- | - |
			| **Last commit:**        | fake-commit-hash |
			| **Worker Name:**        | my-worker |
			| **Deployment URL**:     | https://my-worker.example.workers.dev |
			  "
		`);
	});
});
