import { summary } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { env } from "process";
import { info, warn } from "../utils";
import { OutputEntryPagesDeployment, OutputEntryDeployment } from "../wranglerArtifactManager";
import { WranglerActionConfig } from "../wranglerAction";

type Octokit = ReturnType<typeof getOctokit>;

export async function createGitHubDeployment({
	config,
	octokit,
	productionBranch,
	environment,
	deploymentId,
	projectName,
	deploymentUrl,
}: {
	config: WranglerActionConfig;
	octokit: Octokit;
	productionBranch: string;
	environment: string;
	deploymentId: string | null;
	projectName: string;
	deploymentUrl?: string;
}) {
	const githubBranch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
	const productionEnvironment = githubBranch === productionBranch;

	const deployment = await octokit.rest.repos.createDeployment({
		owner: context.repo.owner,
		repo: context.repo.repo,
		ref: githubBranch || context.ref,
		auto_merge: false,
		description: "Cloudflare Pages",
		required_contexts: [],
		environment,
		production_environment: productionEnvironment,
	});

	if (deployment.status !== 201) {
		info(config, "Error creating GitHub deployment");
		return;
	}

	// Validate deployment URL before using it
	let validatedEnvironmentUrl: string | undefined;
	if (deploymentUrl) {
		try {
			// Clean up the URL by removing any descriptive text in parentheses
			let cleanedUrl = deploymentUrl.replace(/\s*\([^)]*\)\s*$/, '').trim();
			
			// If URL doesn't have a protocol, default to https://
			let urlToValidate = cleanedUrl;
			if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
				urlToValidate = `https://${cleanedUrl}`;
			}
			
			const url = new URL(urlToValidate);
			if (url.protocol === 'https:' || url.protocol === 'http:') {
				validatedEnvironmentUrl = urlToValidate;
			} else {
				info(config, `Invalid deployment URL protocol: ${deploymentUrl}. Must use http(s) scheme.`);
			}
		} catch (error) {
			info(config, `Invalid deployment URL format: ${deploymentUrl}. Error: ${error}`);
		}
	}

	const deploymentStatusPayload = {
		owner: context.repo.owner,
		repo: context.repo.repo,
		deployment_id: deployment.data.id,
		environment,
		production_environment: productionEnvironment,
		log_url: `https://dash.cloudflare.com/${config.CLOUDFLARE_ACCOUNT_ID}/pages/view/${projectName}/${deploymentId}`,
		description: "Cloudflare Pages",
		state: "success" as const,
		auto_inactive: false,
		...(validatedEnvironmentUrl && { environment_url: validatedEnvironmentUrl }),
	};

	await octokit.rest.repos.createDeploymentStatus(deploymentStatusPayload);
}

export async function createWorkersGitHubDeployment({
	config,
	octokit,
	deploymentUrl,
	workerName,
}: {
	config: WranglerActionConfig;
	octokit: Octokit;
	deploymentUrl?: string;
	workerName?: string;
}) {
	const githubBranch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
	const environment = githubBranch === "main" || githubBranch === "master" ? "production" : "preview";
	const productionEnvironment = environment === "production";

	try {
		const deployment = await octokit.rest.repos.createDeployment({
			owner: context.repo.owner,
			repo: context.repo.repo,
			ref: githubBranch || context.ref,
			auto_merge: false,
			description: "Cloudflare Workers",
			required_contexts: [],
			environment,
			production_environment: productionEnvironment,
		});

		if (deployment.status !== 201) {
			info(config, `Error creating GitHub deployment. Status: ${deployment.status}`);
			return;
		}

		const logUrl = workerName 
			? `https://dash.cloudflare.com/${config.CLOUDFLARE_ACCOUNT_ID}/workers/services/view/${workerName}`
			: `https://dash.cloudflare.com/${config.CLOUDFLARE_ACCOUNT_ID}/workers`;

	// Validate deployment URL before using it
	let validatedEnvironmentUrl: string | undefined;
	if (deploymentUrl) {
		try {
			// Clean up the URL by removing any descriptive text in parentheses
			let cleanedUrl = deploymentUrl.replace(/\s*\([^)]*\)\s*$/, '').trim();
			
			// If URL doesn't have a protocol, default to https://
			let urlToValidate = cleanedUrl;
			if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
				urlToValidate = `https://${cleanedUrl}`;
			}
			
			const url = new URL(urlToValidate);
			if (url.protocol === 'https:' || url.protocol === 'http:') {
				validatedEnvironmentUrl = urlToValidate;
			} else {
				info(config, `Invalid deployment URL protocol: ${deploymentUrl}. Must use http(s) scheme.`);
			}
		} catch (error) {
			info(config, `Invalid deployment URL format: ${deploymentUrl}. Error: ${error}`);
		}
	}

		const deploymentStatusPayload = {
			owner: context.repo.owner,
			repo: context.repo.repo,
			deployment_id: deployment.data.id,
			environment,
			production_environment: productionEnvironment,
			log_url: logUrl,
			description: "Cloudflare Workers",
			state: "success" as const,
			auto_inactive: false,
			...(validatedEnvironmentUrl && { environment_url: validatedEnvironmentUrl }),
		};

		await octokit.rest.repos.createDeploymentStatus(deploymentStatusPayload);

		info(config, `Successfully created GitHub deployment for Workers with URL: ${validatedEnvironmentUrl || 'N/A'}`);
	} catch (error) {
		throw new Error(`Failed to create Workers GitHub deployment: ${error}`);
	}
}

export async function createJobSummary({
	commitHash,
	deploymentUrl,
	aliasUrl,
}: {
	commitHash: string;
	deploymentUrl?: string;
	aliasUrl?: string;
}) {
	await summary
		.addRaw(
			`
# Deploying with Cloudflare Pages

| Name                    | Result |
| ----------------------- | - |
| **Last commit:**        | ${commitHash} |
| **Preview URL**:        | ${deploymentUrl} |
| **Branch Preview URL**: | ${aliasUrl} |
  `,
		)
		.write();
}

export async function createJobSummaryForWorkers({
	commitHash,
	deploymentUrl,
	workerName,
}: {
	commitHash?: string;
	deploymentUrl?: string;
	workerName?: string;
}) {
	await summary
		.addRaw(
			`
# Deploying with Cloudflare Workers

| Name                    | Result |
| ----------------------- | - |
${commitHash ? `| **Last commit:**        | ${commitHash} |` : ''}
${workerName ? `| **Worker Name:**        | ${workerName} |` : ''}
| **Deployment URL**:     | ${deploymentUrl || 'N/A'} |
  `,
		)
		.write();
}

/**
 * Create github deployment, if GITHUB_TOKEN is present in config
 */
export async function createGitHubDeploymentAndJobSummary(
	config: WranglerActionConfig,
	pagesArtifactFields: OutputEntryPagesDeployment,
) {
	if (
		config.GITHUB_TOKEN &&
		pagesArtifactFields.production_branch &&
		pagesArtifactFields.pages_project &&
		pagesArtifactFields.deployment_trigger
	) {
		const octokit = getOctokit(config.GITHUB_TOKEN);
		const [createGitHubDeploymentRes, createJobSummaryRes] =
			await Promise.allSettled([
				createGitHubDeployment({
					config,
					octokit,
					deploymentUrl: pagesArtifactFields.url,
					productionBranch: pagesArtifactFields.production_branch,
					environment: pagesArtifactFields.environment,
					deploymentId: pagesArtifactFields.deployment_id,
					projectName: pagesArtifactFields.pages_project,
				}),
				createJobSummary({
					commitHash:
						pagesArtifactFields.deployment_trigger.metadata.commit_hash.substring(
							0,
							8,
						),
					deploymentUrl: pagesArtifactFields.url,
					aliasUrl: pagesArtifactFields.alias,
				}),
			]);

		if (createGitHubDeploymentRes.status === "rejected") {
			warn(config, "Creating Github Deployment failed");
		}

		if (createJobSummaryRes.status === "rejected") {
			warn(config, "Creating Github Job summary failed");
		}
	}
}

/**
 * Create github deployment, if GITHUB_TOKEN is present in config
 */
export async function createWorkersGitHubDeploymentAndJobSummary(
	config: WranglerActionConfig,
	workersArtifactFields: OutputEntryDeployment,
) {
	if (config.GITHUB_TOKEN) {
		const octokit = getOctokit(config.GITHUB_TOKEN);
		const deploymentUrl = workersArtifactFields.targets?.[0];
		
		// Extract worker name from deployment URL if possible
		let workerName: string | undefined;
		if (deploymentUrl) {
			// Clean up the URL by removing any descriptive text in parentheses
			let cleanedUrl = deploymentUrl.replace(/\s*\([^)]*\)\s*$/, '').trim();
			
			// Try to extract worker name from standard workers.dev URL
			const workersDevMatch = cleanedUrl.match(/https:\/\/([^.]+)\.([^.]+\.)?workers\.dev/);
			if (workersDevMatch) {
				workerName = workersDevMatch[1];
			} else {
				// For custom domains, try to extract from subdomain or use hostname
				try {
					// Add protocol if missing for URL parsing
					let urlToParse = cleanedUrl;
					if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
						urlToParse = `https://${cleanedUrl}`;
					}
					
					const url = new URL(urlToParse);
					const hostname = url.hostname;
					// Use the first part of the hostname as worker name for custom domains
					workerName = hostname.split('.')[0];
				} catch (error) {
					// If URL parsing fails, continue without worker name
					info(config, `Could not parse deployment URL for worker name: ${deploymentUrl}`);
				}
			}
		}

		// Get commit hash from git context
		const commitHash = context.sha?.substring(0, 8);

		try {
			const [createGitHubDeploymentRes, createJobSummaryRes] =
				await Promise.allSettled([
					createWorkersGitHubDeployment({
						config,
						octokit,
						deploymentUrl,
						workerName,
					}),
					createJobSummaryForWorkers({
						commitHash,
						deploymentUrl,
						workerName,
					}),
				]);

			if (createGitHubDeploymentRes.status === "rejected") {
				warn(config, `Creating Workers Github Deployment failed: ${createGitHubDeploymentRes.reason}`);
			}

			if (createJobSummaryRes.status === "rejected") {
				warn(config, `Creating Workers Github Job summary failed: ${createJobSummaryRes.reason}`);
			}
		} catch (error) {
			warn(config, `Failed to create Workers GitHub deployment: ${error}`);
		}
	}
}
