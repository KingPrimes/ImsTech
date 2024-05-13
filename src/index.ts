import { firefox, ElementHandle, Page } from 'playwright';
import { expect } from 'playwright/test';

interface CourseInfo {
    title: string;
    semester: string;
    code: string;
    startDate: string;
    percent: string;
}

const homeUrl = 'https://lms.ouchn.cn/user/index#/';
const coursesUrl = 'https://lms.ouchn.cn/user/courses#/';
const loginUrl = `https://iam.pt.ouchn.cn/am/UI/Login`;
const courseUrl = 'https://lms.ouchn.cn/course/';
(async () => {
    // Setup
    const context = await firefox.launchPersistentContext('C:\\FireFoxCache', {
        headless: false,
        slowMo: 450,
        args: ['--disable-blink-features=AutomationControlled'] //关闭自动控制特征
    });
    let page = context.pages()[0];
    await page.goto(homeUrl);
    // 判断是否登录
    await page
        .waitForURL(RegExp(`^${loginUrl}.*`), { timeout: 2000 })
        .then(async () => {
            console.log('to login');
            await login(page);
        })
        .catch(() => {
            console.log('is login');
        });

    await page.getByRole('link', { name: '我的课程' }).click();
    await page.waitForURL(coursesUrl, { timeout: 0, waitUntil: 'load' });
    const listItems = await getCourses(page);
    for (let item of listItems) {
        const activities = await getUnfinishActivities(page, item);
        for (let title of activities) {
            await page.getByText(title).click();
            await page.waitForURL(RegExp(`^${courseUrl}.*`), {
                timeout: 0,
                waitUntil: 'load'
            });
            // div.activity-content-bd.online-video-box 视频
            // div.activity-content-bd.page-box 电子教材
            // div.activity-content-bd.forum-box 课后讨论
            // 点击播放
            await page.locator('i.mvp-fonts.mvp-fonts-play').click();
            const mvpTimeDisplay = page.locator('div.mvp-time-display');
            // start duration / end duration
            // example: 23:11 / 36:11
            const progress = (await mvpTimeDisplay.innerText()).split('/');
            //一直等待直到视频播放完毕
            await page.waitForFunction(
                async (display) => {
                    return (
                        (await display.innerText()).split('/')[0] == progress[0]
                    );
                },
                mvpTimeDisplay,
                { timeout: 0 }
            );
            //回到课程选择页
            await page.waitForURL(coursesUrl, {
                timeout: 0,
                waitUntil: 'load'
            });
        }
    }
    // Teardown
    await context.close();
})();

async function login(page: Page) {
    await page.getByPlaceholder('请输入登录名').fill(process.env.USERNAME!!);
    await page.getByPlaceholder('请输入登录密码').fill(process.env.PASSWORD!!);
    await page.getByRole('button', { name: '登录' }).click();
    // 等待跳转
    await page.waitForURL(homeUrl, { timeout: 0, waitUntil: 'load' });
}

async function getCourses(page: Page): Promise<CourseInfo[]> {
    const olSelector = await page.waitForSelector('ol.courses');
    const liElements = await olSelector.$$('li');
    return await Promise.all(
        liElements.map(async (li: ElementHandle) => {
            // 标题
            const title = await (await li.$('div.course-title'))!!.innerText();
            // 学期
            const semester = await (await li.$(
                'div.course-academic-year-semester'
            ))!!.innerText();
            // 课程代码
            const code = await (await li.$(
                'span[tipsy="course.course_code"]'
            ))!!.innerText();
            // 课程开始时间
            const startDate = await (await li.$(
                'span[ng-bind="course.start_date"]'
            ))!!.innerText();
            // 学习进度
            const percent = await (await li.$(
                'section.percent span[ng-bind="course.completeness + \'%\'"]'
            ))!!.innerText();

            return { title, semester, code, startDate, percent };
        })
    );
}

async function getUnfinishActivities(
    page: Page,
    coursesInfo: CourseInfo
): Promise<string[]> {
    let strs: string[] = [];
    console.log('获取未完成的活动: ', coursesInfo.title);
    await page.getByRole('link', { name: coursesInfo.title }).click();
    await page.waitForURL(RegExp(`^${courseUrl}.*`));
    await page.waitForTimeout(100);
    await page.locator('input[type="checkbox"]').check();
    try {
        const expand = page.getByText('全部展开');
        await expect(expand).toBeVisible({ timeout: 1000 });
        expand.click();
    } catch {
        console.log('没有??全部展开按钮,可能已经展开?');
    }

    //多个课程组
    await page
        .locator('div.learning-activities:not(.ng-hide)')
        .elementHandles()
        .then(async (elements) => {
            for (const element of elements) {
                //课程
                const activities = await element.$$(
                    'div.learning-activity:not(.ng-hide)'
                );
                await Promise.all(
                    activities.map(async (activity: ElementHandle) => {
                        const title = await activity.$(
                            'div.activity-title a.title'
                        );
                        if (title) {
                            strs.push(await title.innerText());
                        }
                    })
                );
            }
        });
    return strs;
}
