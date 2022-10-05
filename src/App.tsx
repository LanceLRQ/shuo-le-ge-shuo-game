import React, {
    FC,
    MouseEventHandler,
    ReactNode,
    SetStateAction,
    useEffect,
    useRef,
    useState,
} from 'react';
import { get } from 'lodash';

import './App.scss';
import {
    parsePathCustomThemeId,
    parsePathThemeName,
    randomString,
    waitTimeout,
} from './utils';
import { shuoshuoTheme } from './themes/shuoshuo';
import { Icon, Theme } from './themes/interface';
import dayjs, { Dayjs } from 'dayjs';
import API from './api';
import { Base64 } from 'js-base64';
import duration from 'dayjs/plugin/duration';
import { PersonalInfo } from './components/PersonalInfo';
dayjs.extend(duration);

// 最大关卡
const maxLevel = 20;

interface MySymbol {
    id: string;
    status: number; // 0->1->2
    isCover: boolean;
    x: number;
    y: number;
    icon: Icon;
}

type Scene = MySymbol[];

// 8*8网格  4*4->8*8
const makeScene: (level: number, icons: Icon[]) => Scene = (level, icons) => {
    const curLevel = Math.min(maxLevel, level);
    const iconPool = icons.slice(0, 2 * curLevel);
    const offsetPool = [0, 25, -25, 50, -50].slice(0, 1 + curLevel);

    const scene: Scene = [];

    const range = [
        [2, 6],
        [1, 6],
        [1, 7],
        [0, 7],
        [0, 8],
    ][Math.min(4, curLevel - 1)];

    const randomSet = (icon: Icon) => {
        const offset =
            offsetPool[Math.floor(offsetPool.length * Math.random())];
        const row =
            range[0] + Math.floor((range[1] - range[0]) * Math.random());
        const column =
            range[0] + Math.floor((range[1] - range[0]) * Math.random());
        scene.push({
            isCover: false,
            status: 0,
            icon,
            id: randomString(6),
            x: column * 100 + offset,
            y: row * 100 + offset,
        });
    };

    // 大于5级别增加icon池
    let compareLevel = curLevel;
    while (compareLevel > 0) {
        iconPool.push(
            ...iconPool.slice(0, Math.min(10, 2 * (compareLevel - 5)))
        );
        compareLevel -= 5;
    }

    for (const icon of iconPool) {
        for (let i = 0; i < 6; i++) {
            randomSet(icon);
        }
    }

    return scene;
};

// o(n) 时间复杂度的洗牌算法
const fastShuffle: <T = any>(arr: T[]) => T[] = (arr) => {
    const res = arr.slice();
    for (let i = 0; i < res.length; i++) {
        const idx = (Math.random() * res.length) >> 0;
        [res[i], res[idx]] = [res[idx], res[i]];
    }
    return res;
};

// 洗牌
const washScene: (level: number, scene: Scene) => Scene = (level, scene) => {
    const updateScene = fastShuffle(scene);
    const offsetPool = [0, 25, -25, 50, -50].slice(0, 1 + level);
    const range = [
        [2, 6],
        [1, 6],
        [1, 7],
        [0, 7],
        [0, 8],
    ][Math.min(4, level - 1)];

    const randomSet = (symbol: MySymbol) => {
        const offset =
            offsetPool[Math.floor(offsetPool.length * Math.random())];
        const row =
            range[0] + Math.floor((range[1] - range[0]) * Math.random());
        const column =
            range[0] + Math.floor((range[1] - range[0]) * Math.random());
        symbol.x = column * 100 + offset;
        symbol.y = row * 100 + offset;
        symbol.isCover = false;
    };

    for (const symbol of updateScene) {
        if (symbol.status !== 0) continue;
        randomSet(symbol);
    }

    return updateScene;
};

interface SymbolProps extends MySymbol {
    onClick: MouseEventHandler;
}

const Symbol: FC<SymbolProps> = ({ x, y, icon, isCover, status, onClick }) => {
    return (
        <div
            className="symbol"
            style={{
                transform: `translateX(${x}%) translateY(${y}%)`,
                backgroundColor: isCover ? '#999' : 'white',
                opacity: status < 2 ? 1 : 0,
            }}
            onClick={onClick}
        >
            <div
                className="symbol-inner"
                draggable="false"
                style={{ opacity: isCover ? 0.4 : 1 }}
            >
                {typeof icon.content === 'string' ? (
                    icon.content.startsWith('http') ? (
                        /*图片外链*/
                        <img src={icon.content} alt="" draggable="false" />
                    ) : (
                        /*字符表情*/
                        <i draggable="false">{icon.content}</i>
                    )
                ) : (
                    /*ReactNode*/
                    icon.content
                )}
            </div>
        </div>
    );
};

export interface RankDiffOptionsType {
    [key: number]: any;
}
// 配置排位难度
const RankDiffOptions: RankDiffOptionsType = {
    1: { levels: [1, 2, 3], range: 1, pop: 0, wash: 1, undo: 1 },
    2: { levels: [3, 4, 5], range: 6, pop: 0, wash: 3, undo: 20 },
    3: { levels: [6, 7, 8, 9], range: 9, pop: 0, wash: 3, undo: 30 },
};

const App: FC = () => {
    const [curTheme, setCurTheme] = useState<Theme<any>>(shuoshuoTheme);

    const [scene, setScene] = useState<Scene>(makeScene(1, curTheme.icons));
    const [level, setLevel] = useState<number>(1);
    const [queue, setQueue] = useState<MySymbol[]>([]);
    const [sortedQueue, setSortedQueue] = useState<
        Record<MySymbol['id'], number>
    >({});
    const [finished, setFinished] = useState<boolean>(false);
    const [rankDialogVis, setRankDialogVis] = useState<boolean>(false);
    const [rankDialogList, setRankDialogList] = useState<any[]>([]);
    const [rankDialogLoadingTip, setRankDialogLoadingTip] =
        useState<string>('');
    const [tipText, setTipText] = useState<string>('');
    const [rankTipText, setRankTipText] = useState<ReactNode>(null);
    const [animating, setAnimating] = useState<boolean>(false);

    const [gameMode, setGameMode] = useState<number>(0); // 0 - 待选择 ； 1 - 排行模式； 2 - 自定义模式
    const gameTimer = useRef<SetStateAction<any>>(null);
    const [gameTimeText, setGameTimeText] = useState<string>('');
    const gameTimeUseRef = useRef<any>({ start: dayjs(), end: dayjs() });
    const [score, setScore] = useState<number>(0);
    const [gameLevels, setGameLevels] = useState<number[]>([]);
    const [gameLevelsCur, setGameLevelsCur] = useState<number>(0);
    const [gameScoreRange, setGameScoreRange] = useState<number>(1);
    const [gamePopTimesRemain, setGamePopTimesRemain] = useState<number>(0);
    const [gameWashTimesRemain, setGameWashTimesRemain] = useState<number>(0);
    const [gameUndoTimesRemain, setGameUndoTimesRemain] = useState<number>(0);
    const [gameToken, setGameToken] = useState<string>('');

    const [changeNameDialogVis, setChangeNameDialogVis] =
        useState<boolean>(false);
    const [changeNameText, setChangeNameText] = useState<string>('');

    // 音效
    const soundRefMap = useRef<Record<string, HTMLAudioElement>>({});

    // 第一次点击时播放bgm
    const bgmRef = useRef<HTMLAudioElement>(null);
    const [bgmOn, setBgmOn] = useState<boolean>(false);
    // const [once, setOnce] = useState<boolean>(false);
    const [userName, setUserName] = useState<string>('');

    useEffect(() => {
        // 初始化游戏
        API.InitGame({})
            .then((resp) => {
                setUserName(get(resp, 'name'));
            })
            .catch((e) => {
                console.error(e.message);
            });
    }, []);

    useEffect(() => {
        if (!bgmRef.current) return;
        if (bgmOn) {
            bgmRef.current.volume = 0.5;
            bgmRef.current.play();
        } else {
            bgmRef.current?.pause();
        }
    }, [bgmOn]);

    // 队列区排序
    useEffect(() => {
        const cache: Record<string, MySymbol[]> = {};
        // 加上索引，避免以id字典序来排
        const idx = 0;
        for (const symbol of queue) {
            if (cache[idx + symbol.icon.name]) {
                cache[idx + symbol.icon.name].push(symbol);
            } else {
                cache[idx + symbol.icon.name] = [symbol];
            }
        }
        const temp = [];
        for (const symbols of Object.values(cache)) {
            temp.push(...symbols);
        }
        const updateSortedQueue: typeof sortedQueue = {};
        let x = 50;
        for (const symbol of temp) {
            updateSortedQueue[symbol.id] = x;
            x += 100;
        }
        setSortedQueue(updateSortedQueue);
    }, [queue]);

    // 初始化覆盖状态
    useEffect(() => {
        checkCover(scene);
    }, []);

    const brokeGame = () => {
        if (!confirm('确定要结束游戏吗？分数将被提交')) return;
        setTipText('游戏结束');
        if (gameTimer.current) {
            clearTimeout(gameTimer.current);
            gameTimer.current = null;
        }
        setFinished(true);
        reportGame();
    };

    const reportGame = () => {
        const timeUsed = Math.ceil(
            gameTimeUseRef.current.end.diff(gameTimeUseRef.current.start) / 1000
        );
        if (timeUsed <= 60) {
            setRankTipText('游戏时长小于1分钟，不计入排行榜');
            return;
        }
        setRankTipText('正在计算结果...');
        const resp = API.FinishGame({
            data: {
                token: gameToken,
                data: Base64.encode(score + '|' + timeUsed),
            },
        })
            .then((resp) => {
                const s = get(resp, 'score');
                const timeUsedRemote = get(resp, 'time_used');
                const total = get(resp, 'total') * 1;
                const rank = get(resp, 'rank') * 1;
                const percent =
                    total > 0 ? ((total - rank + 1) / total) * 100 : 0;
                setRankTipText(
                    <>
                        <p>
                            本次得分：{score}({gameTimeText})
                        </p>
                        <p>
                            最佳得分：{s}(
                            {dayjs
                                .duration(timeUsedRemote * 1000)
                                .format('HH:mm:ss')}
                            )
                        </p>
                        <p>
                            排第{rank}名，打败了{percent.toFixed(2)}
                            %的水晶蟹
                        </p>
                    </>
                );
            })
            .catch((e) => {
                alert(e.message);
                setRankTipText('');
            });
    };

    // 向后检查覆盖
    const checkCover = (scene: Scene) => {
        const updateScene = scene.slice();
        for (let i = 0; i < updateScene.length; i++) {
            // 当前item对角坐标
            const cur = updateScene[i];
            cur.isCover = false;
            if (cur.status !== 0) continue;
            const { x: x1, y: y1 } = cur;
            const x2 = x1 + 100,
                y2 = y1 + 100;

            for (let j = i + 1; j < updateScene.length; j++) {
                const compare = updateScene[j];
                if (compare.status !== 0) continue;

                // 两区域有交集视为选中
                // 两区域不重叠情况取反即为交集
                const { x, y } = compare;

                if (!(y + 100 <= y1 || y >= y2 || x + 100 <= x1 || x >= x2)) {
                    cur.isCover = true;
                    break;
                }
            }
        }
        setScene(updateScene);
    };

    // 弹出
    const pop = () => {
        if (!queue.length) return;
        if (gameMode === 1) {
            if (gamePopTimesRemain <= 0) {
                alert('没有弹出机会了');
                return;
            }
            if (!confirm('是否要使用弹出？')) {
                return;
            }
        }
        const updateQueue = queue.slice();
        const symbol = updateQueue.shift();
        if (!symbol) return;
        if (gameMode === 1) setGamePopTimesRemain(gamePopTimesRemain - 1);
        const find = scene.find((s) => s.id === symbol.id);
        if (find) {
            setQueue(updateQueue);
            find.status = 0;
            find.x = 100 * Math.floor(8 * Math.random());
            find.y = 700;
            checkCover(scene);
            // 音效
            if (soundRefMap.current?.['sound-shift']) {
                soundRefMap.current['sound-shift'].currentTime = 0;
                soundRefMap.current['sound-shift'].play();
            }
        }
    };

    // 撤销
    const undo = () => {
        if (!queue.length) return;
        if (gameMode === 1) {
            if (gameUndoTimesRemain <= 0) {
                alert('没有撤销机会了');
                return;
            }
            if (!confirm('是否要使用撤销？')) {
                return;
            }
        }
        const updateQueue = queue.slice();
        const symbol = updateQueue.pop();
        if (!symbol) return;
        if (gameMode === 1) setGameUndoTimesRemain(gameUndoTimesRemain - 1);
        const find = scene.find((s) => s.id === symbol.id);
        if (find) {
            setQueue(updateQueue);
            find.status = 0;
            checkCover(scene);
            // 音效
            if (soundRefMap.current?.['sound-undo']) {
                soundRefMap.current['sound-undo'].currentTime = 0;
                soundRefMap.current['sound-undo'].play();
            }
        }
    };

    // 洗牌
    const wash = () => {
        if (gameMode === 1) {
            if (gameWashTimesRemain <= 0) {
                alert('没有洗牌机会了');
                return;
            }
            if (!confirm('是否要使用洗牌？')) {
                return;
            }
            setGameWashTimesRemain(gameWashTimesRemain - 1);
        }
        checkCover(washScene(level, scene));
        // 音效
        if (soundRefMap.current?.['sound-wash']) {
            soundRefMap.current['sound-wash'].currentTime = 0;
            soundRefMap.current['sound-wash'].play();
        }
    };

    // 加大难度
    const levelUp = () => {
        let targetLevel = level + 1;
        if (gameMode == 1) {
            if (gameLevelsCur + 1 >= gameLevels.length) {
                return;
            }
            targetLevel = gameLevels[gameLevelsCur] + 1;
            setGameLevelsCur(gameLevelsCur + 1);
        } else {
            if (level >= maxLevel) {
                return;
            }
        }
        setLevel(targetLevel);
        setFinished(false);
        setQueue([]);
        checkCover(makeScene(targetLevel, curTheme.icons));
    };

    // 重开
    const restart = (lv = 1) => {
        setFinished(false);
        setLevel(lv);
        setQueue([]);
        checkCover(makeScene(lv, curTheme.icons));
    };

    // 点击item
    const clickSymbol = async (idx: number) => {
        if (finished || animating) return;

        // if (!once) {
        //     setBgmOn(true);
        //     setOnce(true);
        // }

        // 点击方块才开始计时
        if (gameMode == 1 && !gameTimer.current) {
            gameTimeUseRef.current = {
                start: dayjs(),
                end: dayjs(),
            };
            gameTimer.current = setInterval(() => {
                gameTimeUseRef.current.end = dayjs();
                setGameTimeText(
                    dayjs
                        .duration(
                            gameTimeUseRef.current.end.diff(
                                gameTimeUseRef.current.start
                            )
                        )
                        .format('HH:mm:ss')
                );
            }, 1000);
        }

        const updateScene = scene.slice();
        const symbol = updateScene[idx];
        if (symbol.isCover || symbol.status !== 0) return;
        symbol.status = 1;

        // 点击音效
        if (soundRefMap.current) {
            soundRefMap.current[symbol.icon.clickSound].currentTime = 0;
            soundRefMap.current[symbol.icon.clickSound].play();
        }

        let updateQueue = queue.slice();
        updateQueue.push(symbol);

        setQueue(updateQueue);
        checkCover(updateScene);

        setAnimating(true);
        await waitTimeout(150);

        const filterSame = updateQueue.filter((sb) => sb.icon === symbol.icon);

        // 三连了
        if (filterSame.length === 3) {
            updateQueue = updateQueue.filter((sb) => sb.icon !== symbol.icon);
            for (const sb of filterSame) {
                const find = updateScene.find((i) => i.id === sb.id);
                if (find) {
                    find.status = 2;
                    if (gameMode == 1) {
                        setScore(score + gameScoreRange);
                    }
                    // 三连音效
                    if (soundRefMap.current) {
                        soundRefMap.current[
                            symbol.icon.tripleSound
                        ].currentTime = 0;
                        soundRefMap.current[symbol.icon.tripleSound].play();
                    }
                }
            }
        }

        // 输了
        if (updateQueue.length === 7) {
            setTipText('游戏结束');
            setFinished(true);
            if (gameMode === 1) {
                reportGame();
            }
        }

        if (!updateScene.find((s) => s.status !== 2)) {
            let targetLevel = level + 1;
            // 升级
            if (gameMode == 1) {
                // 胜利
                if (gameLevelsCur + 1 >= gameLevels.length) {
                    setTipText('挑战成功！');
                    if (gameTimer.current) {
                        clearTimeout(gameTimer.current);
                        gameTimer.current = null;
                    }
                    setFinished(true);
                    reportGame();
                    return;
                }
                targetLevel = gameLevels[gameLevelsCur] + 1;
                setGameLevelsCur(gameLevelsCur + 1);
            } else {
                // 胜利
                if (level === maxLevel) {
                    setTipText('完成挑战');
                    setFinished(true);
                    return;
                }
            }
            setLevel(targetLevel);
            setQueue([]);
            checkCover(makeScene(targetLevel, curTheme.icons));
        } else {
            setQueue(updateQueue);
            checkCover(updateScene);
        }

        setAnimating(false);
    };

    const chooseGameMode = (type: number, diff: number) => () => {
        if (type == 1) {
            API.StartGame({})
                .then((resp) => {
                    setGameToken(resp + '');
                    setGameMode(1);
                    setScore(0);
                    const opt: any = RankDiffOptions[diff];
                    setGameLevels(opt.levels);
                    setGameScoreRange(opt.range);
                    setGamePopTimesRemain(opt.pop);
                    setGameWashTimesRemain(opt.wash);
                    setGameUndoTimesRemain(opt.undo);
                    setGameLevelsCur(0);
                    setGameTimeText('00:00:00');
                    gameTimeUseRef.current = {
                        start: dayjs(),
                        end: dayjs(),
                    };
                    restart(opt.levels[0]);
                })
                .catch((e) => {
                    alert(e.message);
                });
        } else {
            setGameMode(2);
            restart();
        }
    };

    const changeUserName = () => {
        if (changeNameText == null || !(changeNameText + '').trim()) {
            return;
        }
        API.ChangeName({
            data: {
                name: changeNameText,
            },
        })
            .then(() => {
                alert('修改成功');
                setUserName(changeNameText);
                setChangeNameDialogVis(false);
            })
            .catch((e) => {
                alert(e.message);
            });
    };

    const restartGame = () => {
        setGameMode(0);
        setFinished(false);
    };

    const showRankList = () => {
        setRankDialogVis(true);
        setRankDialogLoadingTip('载入中...');
        API.GetRankList({})
            .then((resp) => {
                setRankDialogLoadingTip('');
                setRankDialogList(resp as any[]);
            })
            .catch((e) => {
                setRankDialogLoadingTip(e.message || '网络异常');
            });
    };

    return (
        <>
            {/*bgm*/}
            {/*<button className="bgm-button" onClick={() => setBgmOn(!bgmOn)}>*/}
            {/*    {bgmOn ? '🔊' : '🔈'}*/}
            {/*    <audio*/}
            {/*        ref={bgmRef}*/}
            {/*        loop*/}
            {/*        src={curTheme?.bgm || '/sound-disco.mp3'}*/}
            {/*    />*/}
            {/*</button>*/}

            <div className="player-name">
                {/*<a*/}
                {/*    href="javascript:void(0)"*/}
                {/*    onClick={() => {*/}
                {/*        setChangeNameText(userName);*/}
                {/*        setChangeNameDialogVis(true);*/}
                {/*    }}*/}
                {/*    style={{ marginRight: '8px' }}*/}
                {/*>*/}
                {/*    ✏️*/}
                {/*</a>*/}
                {userName}
            </div>

            <h2>{curTheme.title}</h2>
            <h3 className="flex-container flex-center game-status-box">
                {gameMode == 1 ? (
                    <>
                        <div className="game-status-tag">
                            第<span>{gameLevelsCur + 1}</span>关
                        </div>
                        <div className="game-status-tag">
                            用时：
                            <span>{gameTimeText}</span>
                        </div>
                        <div className="game-status-tag">
                            得分: <span>{score}</span>
                        </div>
                    </>
                ) : (
                    <div className="game-status-tag">
                        第<span>{level}</span>关
                    </div>
                )}
            </h3>

            {curTheme.desc}

            <div className="app">
                <div className="scene-container">
                    <div className="scene-inner">
                        {scene.map((item, idx) => (
                            <Symbol
                                key={item.id}
                                {...item}
                                x={
                                    item.status === 0
                                        ? item.x
                                        : item.status === 1
                                        ? sortedQueue[item.id]
                                        : -1000
                                }
                                y={item.status === 0 ? item.y : 895}
                                onClick={() => clickSymbol(idx)}
                            />
                        ))}
                    </div>
                </div>
            </div>
            <div className="queue-container flex-container flex-center" />
            {gameMode == 2 ? (
                <div className="flex-container flex-between">
                    <button className="flex-grow" onClick={pop}>
                        弹出
                    </button>
                    <button className="flex-grow" onClick={undo}>
                        撤销
                    </button>
                    <button className="flex-grow" onClick={wash}>
                        洗牌
                    </button>
                    <button className="flex-grow" onClick={levelUp}>
                        下一关
                    </button>
                </div>
            ) : (
                <div className="flex-container flex-between">
                    {/*<button className="flex-grow" onClick={pop}>*/}
                    {/*    弹出(剩{gamePopTimesRemain}次)*/}
                    {/*</button>*/}
                    <button className="flex-grow" onClick={undo}>
                        撤销(剩{gameUndoTimesRemain}次）
                    </button>
                    <button className="flex-grow" onClick={wash}>
                        洗牌(剩{gameWashTimesRemain}次)
                    </button>
                    <button className="flex-grow" onClick={brokeGame}>
                        什么破游戏！
                    </button>
                </div>
            )}

            {gameMode === 0 && (
                <div className="modal startup-modal">
                    <h1>请选择玩法</h1>
                    <button onClick={chooseGameMode(1, 1)}>
                        排位模式(简单)
                    </button>
                    <button onClick={chooseGameMode(1, 2)}>
                        排位模式(中等)
                    </button>
                    <button onClick={chooseGameMode(1, 3)}>
                        排位模式(困难)
                    </button>
                    <button onClick={chooseGameMode(2, 0)}>自定义模式</button>
                    <button onClick={showRankList}>查看排行榜</button>
                </div>
            )}

            {changeNameDialogVis && (
                <div className="modal startup-modal">
                    <h3>请输入新名字</h3>
                    <input
                        placeholder="10个字符内"
                        maxLength={10}
                        value={changeNameText}
                        onChange={(e) => setChangeNameText(e.target.value)}
                    ></input>
                    <button onClick={changeUserName}>提交</button>
                    <button onClick={() => setChangeNameDialogVis(false)}>
                        取消
                    </button>
                </div>
            )}

            {/*提示弹窗*/}
            {finished && (
                <div className="modal">
                    <h1>{tipText}</h1>
                    {gameMode == 1 && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                {rankTipText}
                            </div>
                            <button onClick={showRankList}>查看排行榜</button>
                        </>
                    )}
                    <button onClick={restartGame}>再来一把</button>
                </div>
            )}

            {/*排行榜*/}
            {rankDialogVis && (
                <div className="modal rank-list">
                    <h1>排行榜</h1>
                    {rankDialogLoadingTip ? (
                        <div style={{ marginBottom: '16px' }}>
                            {rankDialogLoadingTip}
                        </div>
                    ) : (
                        <div className="rank-list-table">
                            {rankDialogList.map((item, index) => {
                                return (
                                    <div
                                        key={`rank_${item.name}_${index}`}
                                        className="rank-list-row"
                                    >
                                        <div className="rank-list-col">
                                            {index + 1}
                                        </div>
                                        <div className="rank-list-col">
                                            {item.name}
                                        </div>
                                        <div className="rank-list-col">
                                            {item.score}
                                        </div>
                                        <div className="rank-list-col">
                                            {dayjs
                                                .duration(item.time_used * 1000)
                                                .format('HH:mm:ss')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <button onClick={() => setRankDialogVis(false)}>
                        关闭
                    </button>
                </div>
            )}

            <PersonalInfo />

            {/*音效*/}
            {curTheme.sounds.map((sound) => (
                <audio
                    key={sound.name}
                    ref={(ref) => {
                        if (ref) soundRefMap.current[sound.name] = ref;
                    }}
                    src={sound.src}
                />
            ))}
        </>
    );
};

export default App;
